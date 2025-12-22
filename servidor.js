const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Integração com a API do Cassino (Mock)
const CASSINO_API = 'http://localhost:4000';

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// --- ESTADO GLOBAL DO JOGO ---
let estadoJogo = { 
    fase: 'APOSTAS', // Fases: APOSTAS, VOANDO, CRASH
    multiplicador: 1.00, 
    crashPoint: 0 
};

io.on('connection', (socket) => {
    
    // 1. Autenticação e Sincronização de Saldo
    socket.on('login', async (username) => {
        socket.username = username;
        try {
            const resposta = await axios.post(`${CASSINO_API}/balance`, { usuario: username });
            socket.emit('saldo_inicial', resposta.data.saldo);
        } catch (erro) {
            console.error("Erro de conexão com API Bancária:", erro.message);
        }
    });

    // 2. Processamento de Aposta
    socket.on('apostar', async (valor) => {
        if (estadoJogo.fase === 'APOSTAS') {
            try {
                const resposta = await axios.post(`${CASSINO_API}/bet`, { 
                    usuario: socket.username, 
                    valor: valor 
                });

                if (resposta.data.sucesso) {
                    socket.emit('aposta_aceita', { novoSaldo: resposta.data.novoSaldo });
                }
            } catch (erro) {
                // Tratamento de erro (ex: saldo insuficiente)
                console.log(`Aposta recusada para ${socket.username}`);
                socket.emit('erro_aposta', 'Saldo Insuficiente!');
            }
        }
    });

    // 3. Processamento de Cashout (Saque)
    socket.on('sacar', async (dados) => {
        if (estadoJogo.fase === 'VOANDO') {
            const lucro = dados.valorApostado * estadoJogo.multiplicador;
            
            try {
                const resposta = await axios.post(`${CASSINO_API}/win`, {
                    usuario: socket.username,
                    valor: lucro
                });

                socket.emit('saque_sucesso', { 
                    novoSaldo: resposta.data.novoSaldo, 
                    ganho: lucro 
                });
            } catch (erro) {
                console.error("Erro ao processar prêmio:", erro.message);
            }
        }
    });
});

// --- ENGINE DO JOGO (LOOP PRINCIPAL) ---
async function rodarJogo() {
    while(true) {
        // FASE 1: APOSTAS ABERTAS
        estadoJogo.fase = 'APOSTAS';
        io.emit('fase', 'APOSTAS');
        
        // Contagem regressiva (5 segundos)
        for(let i=5; i>0; i--) { 
            io.emit('tempo', i); 
            await new Promise(r => setTimeout(r, 1000)); 
        }

        // FASE 2: DECOLAGEM (Multiplier)
        estadoJogo.fase = 'VOANDO';
        io.emit('fase', 'VOANDO');
        
        // Algoritmo simples de Crash (RNG)
        estadoJogo.crashPoint = Math.floor(((Math.random() * 5) + 1) * 100) / 100;
        estadoJogo.multiplicador = 1.00;
        let voando = true;

        console.log(`Rodada Iniciada. Crash Point: ${estadoJogo.crashPoint}x`);

        while(voando) {
            if (estadoJogo.multiplicador >= estadoJogo.crashPoint) {
                // FASE 3: CRASH
                estadoJogo.fase = 'CRASH';
                io.emit('crash', estadoJogo.crashPoint);
                io.emit('fase', 'CRASH');
                voando = false;
            } else {
                io.emit('subindo', estadoJogo.multiplicador.toFixed(2));
                estadoJogo.multiplicador += 0.01;
                await new Promise(r => setTimeout(r, 60)); // Tick rate do jogo
            }
        }
        
        // Intervalo entre rodadas
        await new Promise(r => setTimeout(r, 3000));
    }
}

server.listen(3000, '0.0.0.0', () => {
    console.log('✈️ GAME SERVER RODANDO NA PORTA 3000');
    rodarJogo();
});