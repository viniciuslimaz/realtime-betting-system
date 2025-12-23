const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- BANCO DE DADOS NA MEMÓRIA (Variável Simples) ---
// Toda vez que reiniciar o servidor, zera tudo.
const contasMemory = {};

console.log("⚠️ MODO DE TESTE: Usando Banco em Memória RAM");

// --- ROTAS IDÊNTICAS AO CASSINO REAL ---

// 1. Consultar Saldo
app.post('/balance', (req, res) => {
    const { usuario } = req.body;
    
    if (!contasMemory[usuario]) {
        // Cria usuário novo com 10 mil de bônus pra testar a vontade
        contasMemory[usuario] = 10000.00;
    }
    
    res.json({ saldo: contasMemory[usuario] });
});

// 2. Debitar Aposta
app.post('/bet', (req, res) => {
    const { usuario, valor } = req.body;
    const saldo = contasMemory[usuario] || 0;

    if (saldo >= valor) {
        contasMemory[usuario] = saldo - valor;
        res.json({ sucesso: true, novoSaldo: contasMemory[usuario] });
    } else {
        res.status(400).json({ sucesso: false, msg: "Saldo insuficiente (Fake)" });
    }
});

// 3. Creditar Vitória
app.post('/win', (req, res) => {
    const { usuario, valor } = req.body;
    if (contasMemory[usuario] !== undefined) {
        contasMemory[usuario] += valor;
        res.json({ sucesso: true, novoSaldo: contasMemory[usuario] });
    } else {
        res.status(404).json({ erro: "User não existe" });
    }
});

// Roda na mesma porta 4000
app.listen(4000, () => {
    console.log('🤖 BANCO FAKE RODANDO NA PORTA 4000');
    console.log('Pode testar o frontend à vontade!');
});