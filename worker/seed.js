// Carrega dados de exemplo (fictícios) no banco.
// Docker:     docker compose exec worker node seed.js
// Kubernetes: kubectl exec deploy/worker -- node seed.js
const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017';
const DB_NAME = process.env.DB_NAME || 'financas';

// Datas sempre no mês atual, para a demonstração funcionar em qualquer época
const mes = new Date().toISOString().slice(0, 7);
const dia = (d) => `${mes}-${String(d).padStart(2, '0')}`;

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);

  if (await db.collection('categorias').countDocuments()) {
    console.log('O banco já possui dados. Nada foi inserido.');
    return client.close();
  }

  const membros = await db.collection('membros').insertMany([
    { nome: 'Carlos Silva', parentesco: 'pai' },
    { nome: 'Ana Silva', parentesco: 'mãe' },
    { nome: 'Lucas Silva', parentesco: 'filho' },
  ]);
  const [carlos, ana, lucas] = Object.values(membros.insertedIds);

  const lista = [
    { nome: 'Salário', tipo: 'receita' },
    { nome: 'Freelance', tipo: 'receita' },
    { nome: 'Aluguel', tipo: 'despesa' },
    { nome: 'Mercado', tipo: 'despesa' },
    { nome: 'Contas de casa', tipo: 'despesa' },
    { nome: 'Transporte', tipo: 'despesa' },
    { nome: 'Lazer', tipo: 'despesa' },
  ];
  const cats = await db.collection('categorias').insertMany(lista);
  const cat = {};
  lista.forEach((c, i) => { cat[c.nome] = { ...c, _id: cats.insertedIds[i] }; });

  const lanc = (descricao, valor, nomeCat, d) => ({
    descricao, valor, categoria_id: cat[nomeCat]._id, categoria: nomeCat, tipo: cat[nomeCat].tipo, data: dia(d),
  });
  // Despesas somam R$ 3.180,00, acima do limite padrão (R$ 3.000,00), para o worker gerar um alerta
  await db.collection('lancamentos').insertMany([
    lanc('Salário Carlos', 4500, 'Salário', 5),
    lanc('Salário Ana', 3200, 'Salário', 5),
    lanc('Site para cliente', 800, 'Freelance', 12),
    lanc('Aluguel do apartamento', 1500, 'Aluguel', 10),
    lanc('Compra do mês', 850, 'Mercado', 6),
    lanc('Padaria e feira', 180, 'Mercado', 14),
    lanc('Conta de luz', 210, 'Contas de casa', 15),
    lanc('Internet', 120, 'Contas de casa', 15),
    lanc('Combustível', 250, 'Transporte', 8),
    lanc('Cinema', 70, 'Lazer', 9),
  ]);

  await db.collection('recorrencias').insertMany([
    { descricao: 'Aluguel do apartamento', valor: 1500, categoria_id: cat['Aluguel']._id, dia_vencimento: 10, membro_id: carlos },
    { descricao: 'Internet', valor: 120, categoria_id: cat['Contas de casa']._id, dia_vencimento: 15, membro_id: ana },
    { descricao: 'Mensalidade do curso', valor: 300, categoria_id: cat['Lazer']._id, dia_vencimento: 20, membro_id: lucas },
  ]);

  console.log(`Dados de exemplo inseridos para ${mes}.`);
  await client.close();
}

main().catch((e) => {
  console.error('Erro ao carregar dados de exemplo:', e.message);
  process.exit(1);
});
