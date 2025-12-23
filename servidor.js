const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CASSINO_API = process.env.CASSINO_API_URL || 'http://localhost:4000';

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

// --- ESTADO GLOBAL ---
let estadoJogo = { 
    fase: 'APOSTAS', 
    multiplicador: 1.00, 
    crashPoint: 0,
    serverSeed: '', 
    serverHash: '', 
    clienteSeed: '0000000000000000000180293', 
    finalSeeds: [], // Quem gerou o resultado
    historico: [] 
};

// --- FUNÇÕES AUXILIARES ---

// Gera string aleatória segura (para seeds)
function gerarSeedAleatoria(tamanho = 16) {
    return crypto.randomBytes(tamanho).toString('hex').slice(0, tamanho);
}

// Ordena: Maior valor -> Menor valor e envia pro front
function atualizarListaApostas() {
    apostasRodada.sort((a, b) => parseFloat(b.valor) - parseFloat(a.valor));
    io.emit('lista_apostas', apostasRodada);
}

// Cálculo do Crash (Aviator Style)
function calcularResultado(serverSeed, clientSeeds) {
    const combinedSeed = serverSeed + clientSeeds.join('');
    const hash = crypto.createHash('sha512').update(combinedSeed).digest('hex');
    const hexFragment = hash.substring(0, 13);
    const decimal = parseInt(hexFragment, 16);
    
    if (decimal % 33 === 0) return 1.00;
    
    const e = Math.pow(2, 52);
    const resultado = Math.floor((100 * e - decimal) / (e - decimal)) / 100;
    return Math.max(1.00, resultado);
}

// --- BOTS ---
const nomesBots = ["Pedro_88", "Ana.Bet", "JoaoSorte", "TraderPro", "MestreDoCrash", "LuizaWin", "Felipe_Trader", "Vini_Boss"];
const valoresComuns = [10.00, 20.00, 50.00, 100.00, 200.00, 500.00]; 
let apostasRodada = []; 

function gerarApostasBots() {
    const qtdBots = Math.floor(Math.random() * 5) + 3;
    for(let i=0; i<qtdBots; i++) {
        const botName = nomesBots[Math.floor(Math.random() * nomesBots.length)];
        const bot = {
            user: botName,
            valor: valoresComuns[Math.floor(Math.random() * valoresComuns.length)].toFixed(2),
            target: (Math.random() * 4 + 1.1).toFixed(2), 
            status: 'APOSTADO', 
            bot: true, 
            clientSeed: gerarSeedAleatoria(12) // AGORA TEM SEED REAL
        };
        apostasRodada.push(bot);
    }
    atualizarListaApostas();
}

// --- SOCKET IO ---
io.on('connection', (socket) => {
    socket.emit('historico', estadoJogo.historico);
    if(estadoJogo.serverHash) socket.emit('hash_jogo', estadoJogo.serverHash);

    socket.on('login', async (username) => {
        socket.username = username;
        // Gera seed para o jogador ao logar
        socket.clientSeed = gerarSeedAleatoria(12);
        socket.emit('minha_seed', socket.clientSeed);

        try {
            const resposta = await axios.post(`${CASSINO_API}/balance`, { usuario: username });
            socket.emit('saldo_inicial', resposta.data.saldo);
        } catch (e) { console.error("Erro API"); }
    });

    socket.on('apostar', async (dados) => {
        if (estadoJogo.fase === 'APOSTAS') {
            try {
                const resposta = await axios.post(`${CASSINO_API}/bet`, { usuario: socket.username, valor: dados.valor });
                if (resposta.data.sucesso) {
                    socket.emit('aposta_aceita', { novoSaldo: resposta.data.novoSaldo, id: dados.id });
                    
                    const idx = apostasRodada.findIndex(a => a.user === socket.username && a.betId === dados.id);
                    const novaAposta = { 
                        user: socket.username, valor: dados.valor.toFixed(2), status: 'APOSTADO', 
                        betId: dados.id, socketId: socket.id, 
                        clientSeed: socket.clientSeed // USA A SEED REAL DO JOGADOR
                    };

                    if(idx >= 0) apostasRodada[idx] = novaAposta; 
                    else apostasRodada.push(novaAposta);

                    atualizarListaApostas();
                }
            } catch (e) { socket.emit('erro_aposta', { msg: 'Saldo Insuficiente!', id: dados.id }); }
        }
    });

    socket.on('sacar', async (dados) => {
        if (estadoJogo.fase === 'VOANDO') {
            const apostaUser = apostasRodada.find(a => a.socketId === socket.id && a.betId === dados.id && a.status === 'APOSTADO');
            if (apostaUser) {
                const lucro = apostaUser.valor * estadoJogo.multiplicador;
                try {
                    const resposta = await axios.post(`${CASSINO_API}/win`, { usuario: socket.username, valor: lucro });
                    socket.emit('saque_sucesso', { novoSaldo: resposta.data.novoSaldo, ganho: lucro, id: dados.id });
                    apostaUser.status = 'SACOU'; apostaUser.ganho = lucro;
                    atualizarListaApostas();
                } catch (e) { console.error(e); }
            }
        }
    });
});

// --- GAME LOOP ---
async function rodarJogo() {
    while(true) {
        // 1. PREPARAÇÃO
        estadoJogo.serverSeed = gerarSeedAleatoria(32);
        estadoJogo.serverHash = crypto.createHash('sha256').update(estadoJogo.serverSeed).digest('hex');
        apostasRodada = [];
        atualizarListaApostas();

        console.log(`--- NOVA RODADA --- Hash: ${estadoJogo.serverHash}`);

        // 2. FASE APOSTAS
        estadoJogo.fase = 'APOSTAS';
        io.emit('fase', 'APOSTAS');
        io.emit('hash_jogo', estadoJogo.serverHash);
        gerarApostasBots();

        for(let i=5; i>0; i--) { 
            io.emit('tempo', i); 
            await new Promise(r => setTimeout(r, 1000)); 
        }

        // 3. CÁLCULO E INÍCIO DO VOO
        
        // Pega as seeds dos Top 3 da lista (que já está ordenada por valor)
        // Isso significa que os maiores apostadores definem o resultado (mecânica interessante!)
        let seedsParticipantes = [];
        let detalhesSeeds = [];

        for(let i = 0; i < apostasRodada.length && i < 3; i++) {
            let p = apostasRodada[i];
            seedsParticipantes.push(p.clientSeed);
            detalhesSeeds.push({ user: p.user, seed: p.clientSeed });
        }
        if(seedsParticipantes.length === 0) seedsParticipantes.push('sem_apostas');

        // Calcula resultado final
        estadoJogo.crashPoint = calcularResultado(estadoJogo.serverSeed, seedsParticipantes);
        estadoJogo.finalSeeds = detalhesSeeds;

        // *** ENVIA DADOS PARCIAIS (PARA O USUÁRIO VER AS SEEDS ANTES DO CRASH) ***
        const dadosParciais = {
            point: null, // Ainda não mostra o ponto
            serverSeed: null, // Ainda oculto
            serverHash: estadoJogo.serverHash,
            gamers: estadoJogo.finalSeeds, // MOSTRA OS GAMERS AGORA
            finalHash: 'Calculando...'
        };
        io.emit('dados_verificacao', dadosParciais);

        console.log(`Crash Calculado: ${estadoJogo.crashPoint}x`);

        // FASE VOANDO
        estadoJogo.fase = 'VOANDO';
        io.emit('fase', 'VOANDO');
        estadoJogo.multiplicador = 1.00;
        let voando = true;

        while(voando) {
            let mudouStatus = false;
            apostasRodada.forEach(bot => {
                if(bot.bot && bot.status === 'APOSTADO' && estadoJogo.multiplicador >= bot.target) {
                    bot.status = 'SACOU'; bot.ganho = bot.valor * bot.target;
                    mudouStatus = true;
                }
            });
            if(mudouStatus) atualizarListaApostas();

            if (estadoJogo.multiplicador >= estadoJogo.crashPoint) {
                // CRASH
                estadoJogo.fase = 'CRASH';
                io.emit('crash', estadoJogo.crashPoint);
                io.emit('fase', 'CRASH');
                
                // REVELAÇÃO TOTAL
                const dadosCompletos = {
                    point: estadoJogo.crashPoint,
                    serverSeed: estadoJogo.serverSeed, // Revela segredo
                    serverHash: estadoJogo.serverHash,
                    gamers: estadoJogo.finalSeeds,
                    finalHash: crypto.createHash('sha512').update(estadoJogo.serverSeed + seedsParticipantes.join('')).digest('hex')
                };
                io.emit('dados_verificacao', dadosCompletos);

                estadoJogo.historico.unshift(dadosCompletos);
                if(estadoJogo.historico.length > 20) estadoJogo.historico.pop();
                io.emit('historico', estadoJogo.historico);

                voando = false;
            } else {
                io.emit('subindo', estadoJogo.multiplicador.toFixed(2));
                estadoJogo.multiplicador += 0.01;
                let delay = 60;
                if(estadoJogo.multiplicador > 2) delay = 50;
                if(estadoJogo.multiplicador > 5) delay = 40;
                if(estadoJogo.multiplicador > 10) delay = 20;
                await new Promise(r => setTimeout(r, delay)); 
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
}

server.listen(3000, '0.0.0.0', () => {
    console.log('🎰 SERVER V3.0 (RANKING + FAIR REAL) RODANDO');
    rodarJogo();
});