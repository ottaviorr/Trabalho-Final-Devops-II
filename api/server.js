const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017';
const DB_NAME = process.env.DB_NAME || 'financas';
const PORT = process.env.PORT || 3000;
const VERSAO = process.env.VERSAO || 'v1';

const app = express();
app.use(express.json());

let db;

const TIPOS = ['receita', 'despesa'];
const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
const mesValido = (m) => /^\d{4}-\d{2}$/.test(m);
const mesAtual = () => new Date().toISOString().slice(0, 7);

function idValido(req, res) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ erro: 'id inválido' });
    return null;
  }
  return new ObjectId(req.params.id);
}

// Lê ?mes=AAAA-MM (padrão: mês atual)
function lerMes(req, res) {
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) {
    res.status(400).json({ erro: 'mes deve estar no formato AAAA-MM' });
    return null;
  }
  return mes;
}

// Valida o corpo de um lançamento e devolve o documento a ser gravado
async function montarLancamento(body) {
  const { descricao, valor, categoria_id, data } = body;
  if (!descricao || typeof descricao !== 'string') return { erro: 'descricao é obrigatória' };
  const v = Number(valor);
  if (!(v > 0)) return { erro: 'valor deve ser maior que zero' };
  if (!dataValida(data)) return { erro: 'data deve estar no formato AAAA-MM-DD' };
  if (!ObjectId.isValid(categoria_id)) return { erro: 'categoria_id inválido' };
  const categoria = await db.collection('categorias').findOne({ _id: new ObjectId(categoria_id) });
  if (!categoria) return { erro: 'categoria não encontrada' };
  return {
    doc: {
      descricao: descricao.trim(),
      valor: v,
      categoria_id: categoria._id,
      categoria: categoria.nome,
      tipo: categoria.tipo,
      data,
    },
  };
}

// Soma receitas e despesas do mês
async function resumoMes(mes) {
  const r = await db.collection('lancamentos').aggregate([
    { $match: { data: { $regex: `^${mes}` } } },
    { $group: { _id: '$tipo', total: { $sum: '$valor' }, qtd: { $sum: 1 } } },
  ]).toArray();
  const total = (t) => r.find((x) => x._id === t)?.total || 0;
  const receitas = total('receita');
  const despesas = total('despesa');
  return { mes, receitas, despesas, saldo: receitas - despesas };
}

async function despesasPorCategoria(mes) {
  return db.collection('lancamentos').aggregate([
    { $match: { tipo: 'despesa', data: { $regex: `^${mes}` } } },
    { $group: { _id: '$categoria', total: { $sum: '$valor' } } },
    { $project: { _id: 0, categoria: '$_id', total: 1 } },
    { $sort: { total: -1 } },
  ]).toArray();
}

// ---------- Status ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok', versao: VERSAO }));

// ---------- Categorias ----------
app.get('/api/categorias', async (req, res) => {
  res.json(await db.collection('categorias').find().sort({ tipo: 1, nome: 1 }).toArray());
});

app.post('/api/categorias', async (req, res) => {
  const { nome, tipo } = req.body;
  if (!nome || typeof nome !== 'string') return res.status(400).json({ erro: 'nome é obrigatório' });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: 'tipo deve ser receita ou despesa' });
  const doc = { nome: nome.trim(), tipo };
  if (await db.collection('categorias').findOne(doc)) {
    return res.status(409).json({ erro: 'categoria já existe' });
  }
  const r = await db.collection('categorias').insertOne(doc);
  res.status(201).json({ _id: r.insertedId, ...doc });
});

app.delete('/api/categorias/:id', async (req, res) => {
  const id = idValido(req, res);
  if (!id) return;
  if (await db.collection('lancamentos').findOne({ categoria_id: id })) {
    return res.status(409).json({ erro: 'categoria possui lançamentos' });
  }
  const r = await db.collection('categorias').deleteOne({ _id: id });
  if (!r.deletedCount) return res.status(404).json({ erro: 'categoria não encontrada' });
  res.status(204).end();
});

// ---------- Lançamentos ----------
app.get('/api/lancamentos', async (req, res) => {
  const filtro = {};
  if (req.query.mes) {
    const mes = lerMes(req, res);
    if (!mes) return;
    filtro.data = { $regex: `^${mes}` };
  }
  res.json(await db.collection('lancamentos').find(filtro).sort({ data: -1 }).toArray());
});

app.post('/api/lancamentos', async (req, res) => {
  const { doc, erro } = await montarLancamento(req.body);
  if (erro) return res.status(400).json({ erro });
  const r = await db.collection('lancamentos').insertOne(doc);
  res.status(201).json({ _id: r.insertedId, ...doc });
});

app.put('/api/lancamentos/:id', async (req, res) => {
  const id = idValido(req, res);
  if (!id) return;
  const { doc, erro } = await montarLancamento(req.body);
  if (erro) return res.status(400).json({ erro });
  const r = await db.collection('lancamentos').updateOne({ _id: id }, { $set: doc });
  if (!r.matchedCount) return res.status(404).json({ erro: 'lançamento não encontrado' });
  res.json({ _id: id, ...doc });
});

app.delete('/api/lancamentos/:id', async (req, res) => {
  const id = idValido(req, res);
  if (!id) return;
  const r = await db.collection('lancamentos').deleteOne({ _id: id });
  if (!r.deletedCount) return res.status(404).json({ erro: 'lançamento não encontrado' });
  res.status(204).end();
});

// ---------- Consultas e relatório ----------
app.get('/api/saldo', async (req, res) => {
  const mes = lerMes(req, res);
  if (!mes) return;
  res.json(await resumoMes(mes));
});

app.get('/api/despesas-por-categoria', async (req, res) => {
  const mes = lerMes(req, res);
  if (!mes) return;
  res.json(await despesasPorCategoria(mes));
});

app.get('/api/relatorio', async (req, res) => {
  const mes = lerMes(req, res);
  if (!mes) return;
  res.json(await resumoMes(mes));
});

// ---------- Alertas (gravados pelo worker) ----------
app.get('/api/alertas', async (req, res) => {
  res.json(await db.collection('alertas').find().sort({ criado_em: -1 }).toArray());
});

// Erro inesperado (ex.: banco fora do ar) vira 500 em vez de derrubar o processo
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'erro interno' });
});

async function iniciar() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  db = client.db(DB_NAME);
  app.listen(PORT, () => console.log(`API ${VERSAO} ouvindo na porta ${PORT}`));
}

iniciar().catch((e) => {
  console.error('Falha ao conectar no MongoDB:', e.message);
  process.exit(1);
});
