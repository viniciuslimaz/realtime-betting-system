const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const db = new sqlite3.Database('./banco_cassino.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS contas (usuario TEXT PRIMARY KEY, saldo REAL)");
});

// --- ROTAS DA API (ENDPOINTS) ---

// 1. Consultar Saldo (Get Balance)
app.post('/balance', (req, res) => {
    const { usuario } = req.body;
    
    db.get("SELECT saldo FROM contas WHERE usuario = ?", [usuario], (err, row) => {
        if (!row) {
            // Regra de Negócio: Usuários novos ganham bônus de boas-vindas
            db.run("INSERT INTO contas (usuario, saldo) VALUES (?, ?)", [usuario, 1000.00]);
            res.json({ saldo: 1000.00 });
        } else {
            res.json({ saldo: row.saldo });
        }
    });
});

// 2. Processar Aposta (Debit Transaction)
app.post('/bet', (req, res) => {
    const { usuario, valor } = req.body;

    db.get("SELECT saldo FROM contas WHERE usuario = ?", [usuario], (err, row) => {
        if (row && row.saldo >= valor) {
            const novoSaldo = row.saldo - valor;
            db.run("UPDATE contas SET saldo = ? WHERE usuario = ?", [novoSaldo, usuario], () => {
                res.json({ sucesso: true, novoSaldo: novoSaldo });
            });
        } else {
            res.status(400).json({ sucesso: false, msg: "Saldo insuficiente" });
        }
    });
});

// 3. Processar Vitória (Credit Transaction)
app.post('/win', (req, res) => {
    const { usuario, valor } = req.body;

    db.get("SELECT saldo FROM contas WHERE usuario = ?", [usuario], (err, row) => {
        if (row) {
            const novoSaldo = row.saldo + valor;
            db.run("UPDATE contas SET saldo = ? WHERE usuario = ?", [novoSaldo, usuario], () => {
                res.json({ sucesso: true, novoSaldo: novoSaldo });
            });
        }
    });
});

// Inicialização do Servidor Bancário
app.listen(4000, () => {
    console.log('🏦 API DO CASSINO RODANDO NA PORTA 4000');
});