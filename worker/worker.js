const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017';
const DB_NAME = process.env.DB_NAME || 'financas';
const LIMITE = Number(process.env.LIMITE_DESPESAS || 3000);
const INTERVALO_MS = 60 * 1000;

const moeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function verificar(db) {
  const mes = new Date().toISOString().slice(0, 7);
  const [r] = await db.collection('lancamentos').aggregate([
    { $match: { tipo: 'despesa', data: { $regex: `^${mes}` } } },
    { $group: { _id: null, total: { $sum: '$valor' } } },
  ]).toArray();
  const total = r ? r.total : 0;

  console.log(`[${new Date().toISOString()}] ${mes}: despesas ${moeda(total)} / limite ${moeda(LIMITE)}`);
  if (total <= LIMITE) return;

  // Um alerta por mês: só insere se ainda não existe alerta para este mês
  const res = await db.collection('alertas').updateOne(
    { mes },
    {
      $setOnInsert: {
        mes,
        total_despesas: total,
        limite: LIMITE,
        mensagem: `Despesas de ${mes} (${moeda(total)}) ultrapassaram o limite de ${moeda(LIMITE)}`,
        criado_em: new Date(),
      },
    },
    { upsert: true },
  );
  if (res.upsertedCount) console.log(`Alerta registrado para ${mes}`);
}

async function iniciar() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`Worker iniciado. Limite mensal: ${moeda(LIMITE)}`);

  const rodar = () => verificar(db).catch((e) => console.error('Erro na verificação:', e.message));
  rodar();
  setInterval(rodar, INTERVALO_MS);
}

iniciar().catch((e) => {
  console.error('Falha ao conectar no MongoDB:', e.message);
  process.exit(1);
});
