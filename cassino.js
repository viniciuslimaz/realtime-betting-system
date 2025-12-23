const express = require('express');
const { Pool } = require('pg'); // Cliente do PostgreSQL
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONEXÃO COM O BANCO DE DADOS (PostgreSQL) ---
// Ele busca a URL na variável de ambiente DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Necessário para conexão segura no Render
});

// Cria a tabela automaticamente se não existir
pool.query(`
    CREATE TABLE IF NOT EXISTS contas (
        usuario TEXT PRIMARY KEY,
        saldo DECIMAL(10,2) NOT NULL DEFAULT 0.00
    )
`).then(() => console.log("✅ Tabela 'contas' verificada no PostgreSQL"))
  .catch(err => console.error("Erro ao criar tabela:", err));

// --- ROTAS DA API (ENDPOINTS) ---

// 1. Consultar Saldo
app.post('/balance', async (req, res) => {
    const { usuario } = req.body;
    
    try {
        const resultado = await pool.query("SELECT saldo FROM contas WHERE usuario = $1", [usuario]);
        
        if (resultado.rows.length === 0) {
            // Regra: Usuário novo ganha R$ 1000.00
            await pool.query("INSERT INTO contas (usuario, saldo) VALUES ($1, $2)", [usuario, 1000.00]);
            res.json({ saldo: 1000.00 });
        } else {
            // O Postgres retorna o número como string (para precisão), convertemos para float
            res.json({ saldo: parseFloat(resultado.rows[0].saldo) });
        }
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro no banco de dados" });
    }
});

// 2. Debitar Aposta
app.post('/bet', async (req, res) => {
    const { usuario, valor } = req.body;

    try {
        const resultado = await pool.query("SELECT saldo FROM contas WHERE usuario = $1", [usuario]);
        
        if (resultado.rows.length > 0) {
            const saldoAtual = parseFloat(resultado.rows[0].saldo);
            
            if (saldoAtual >= valor) {
                const novoSaldo = saldoAtual - valor;
                await pool.query("UPDATE contas SET saldo = $1 WHERE usuario = $2", [novoSaldo, usuario]);
                res.json({ sucesso: true, novoSaldo: novoSaldo });
            } else {
                res.status(400).json({ sucesso: false, msg: "Saldo insuficiente" });
            }
        } else {
            res.status(404).json({ erro: "Usuário não encontrado" });
        }
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao processar aposta" });
    }
});

// 3. Creditar Vitória
app.post('/win', async (req, res) => {
    const { usuario, valor } = req.body;

    try {
        // UPDATE direto incrementando o valor (Mais seguro e atômico)
        const resultado = await pool.query(
            "UPDATE contas SET saldo = saldo + $1 WHERE usuario = $2 RETURNING saldo",
            [valor, usuario]
        );

        if (resultado.rows.length > 0) {
            res.json({ sucesso: true, novoSaldo: parseFloat(resultado.rows[0].saldo) });
        } else {
            res.status(404).json({ erro: "Usuário não encontrado" });
        }
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao pagar prêmio" });
    }
});

// Inicialização
const PORT = process.env.PORT || 4000;
// --- ROTA DO PAINEL ADMIN (NOVO) ---
app.get('/stats', async (req, res) => {
    const { token } = req.query;

    // Senha simples de proteção
    if (token !== 'admin123') {
        return res.status(403).json({ erro: "Acesso Negado. Saia daqui!" });
    }

    try {
        // Busca: Total de Usuários e Soma de todos os Saldos
        const resultado = await pool.query("SELECT COUNT(*) as total_users, SUM(saldo) as total_money FROM contas");
        
        const dados = resultado.rows[0];
        
        // Postgres retorna números grandes como String, precisamos converter
        res.json({
            usuarios: parseInt(dados.total_users),
            dinheiro_em_jogo: parseFloat(dados.total_money || 0) // Se for null, retorna 0
        });

    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao buscar estatísticas" });
    }
});
app.listen(PORT, () => {
    console.log(`🏦 API DO CASSINO (Postgres) RODANDO NA PORTA ${PORT}`);
});