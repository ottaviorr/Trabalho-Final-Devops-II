const API = '/api';
const $ = (id) => document.getElementById(id);
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d) => d.split('-').reverse().join('/');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let editandoId = null;
let lancamentos = [];

$('mes').value = new Date().toISOString().slice(0, 7);

function mostrarMensagem(texto, erro = false) {
  $('mensagem').textContent = texto;
  $('mensagem').className = erro ? 'erro' : 'ok';
  setTimeout(() => { $('mensagem').textContent = ''; }, 4000);
}

async function api(caminho, opcoes = {}) {
  const resp = await fetch(API + caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  if (resp.status === 204) return null;
  const dados = await resp.json();
  if (!resp.ok) throw new Error(dados.erro || 'Erro na requisição');
  return dados;
}

// ---------- Navegação ----------
document.querySelectorAll('nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((b) => b.classList.remove('ativo'));
    document.querySelectorAll('.tela').forEach((t) => t.classList.remove('ativa'));
    btn.classList.add('ativo');
    $(btn.dataset.tela).classList.add('ativa');
    carregarTudo();
  });
});

$('mes').addEventListener('change', carregarTudo);

// ---------- Categorias ----------
async function carregarCategorias() {
  const cats = await api('/categorias');
  $('tabela-cat').innerHTML = cats.map((c) => `
    <tr>
      <td>${esc(c.nome)}</td>
      <td class="${c.tipo}">${c.tipo}</td>
      <td><button onclick="excluirCategoria('${c._id}')">Excluir</button></td>
    </tr>`).join('') || '<tr><td colspan="3">Nenhuma categoria cadastrada</td></tr>';

  const selecionada = $('select-categoria').value;
  $('select-categoria').innerHTML = '<option value="">Categoria...</option>' +
    cats.map((c) => `<option value="${c._id}">${esc(c.nome)} (${c.tipo})</option>`).join('');
  $('select-categoria').value = selecionada;
}

$('form-cat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  try {
    await api('/categorias', { method: 'POST', body: JSON.stringify(dados) });
    e.target.reset();
    mostrarMensagem('Categoria cadastrada');
    carregarCategorias();
  } catch (err) { mostrarMensagem(err.message, true); }
});

async function excluirCategoria(id) {
  if (!confirm('Excluir esta categoria?')) return;
  try {
    await api(`/categorias/${id}`, { method: 'DELETE' });
    mostrarMensagem('Categoria excluída');
    carregarCategorias();
  } catch (err) { mostrarMensagem(err.message, true); }
}

// ---------- Lançamentos ----------
async function carregarLancamentos() {
  lancamentos = await api(`/lancamentos?mes=${$('mes').value}`);
  $('tabela-lanc').innerHTML = lancamentos.map((l) => `
    <tr>
      <td>${dataBR(l.data)}</td>
      <td>${esc(l.descricao)}</td>
      <td>${esc(l.categoria)}</td>
      <td class="${l.tipo}">${l.tipo}</td>
      <td class="${l.tipo}">${moeda(l.valor)}</td>
      <td>
        <button onclick="editarLancamento('${l._id}')">Editar</button>
        <button onclick="excluirLancamento('${l._id}')">Excluir</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6">Nenhum lançamento neste mês</td></tr>';
}

function limparFormLancamento() {
  editandoId = null;
  $('form-lanc').reset();
  $('titulo-form-lanc').textContent = 'Novo lançamento';
  $('btn-salvar-lanc').textContent = 'Registrar';
  $('btn-cancelar-lanc').hidden = true;
}

function editarLancamento(id) {
  const l = lancamentos.find((x) => x._id === id);
  const form = $('form-lanc');
  form.descricao.value = l.descricao;
  form.valor.value = l.valor;
  form.categoria_id.value = l.categoria_id;
  form.data.value = l.data;
  editandoId = id;
  $('titulo-form-lanc').textContent = 'Editar lançamento';
  $('btn-salvar-lanc').textContent = 'Salvar';
  $('btn-cancelar-lanc').hidden = false;
}

$('btn-cancelar-lanc').addEventListener('click', limparFormLancamento);

$('form-lanc').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  try {
    if (editandoId) {
      await api(`/lancamentos/${editandoId}`, { method: 'PUT', body: JSON.stringify(dados) });
      mostrarMensagem('Lançamento atualizado');
    } else {
      await api('/lancamentos', { method: 'POST', body: JSON.stringify(dados) });
      mostrarMensagem('Lançamento registrado');
    }
    limparFormLancamento();
    carregarLancamentos();
  } catch (err) { mostrarMensagem(err.message, true); }
});

async function excluirLancamento(id) {
  if (!confirm('Excluir este lançamento?')) return;
  try {
    await api(`/lancamentos/${id}`, { method: 'DELETE' });
    mostrarMensagem('Lançamento excluído');
    carregarLancamentos();
  } catch (err) { mostrarMensagem(err.message, true); }
}

// ---------- Saldo, despesas por categoria e relatório ----------
async function carregarSaldo() {
  const s = await api(`/saldo?mes=${$('mes').value}`);
  $('saldo-receitas').textContent = moeda(s.receitas);
  $('saldo-despesas').textContent = moeda(s.despesas);
  $('saldo-saldo').textContent = moeda(s.saldo);
  $('saldo-saldo').className = s.saldo < 0 ? 'despesa' : 'receita';
}

async function carregarPorCategoria() {
  const lista = await api(`/despesas-por-categoria?mes=${$('mes').value}`);
  $('tabela-por-cat').innerHTML = lista.map((c) => `
    <tr><td>${esc(c.categoria)}</td><td class="despesa">${moeda(c.total)}</td></tr>`).join('')
    || '<tr><td colspan="2">Nenhuma despesa neste mês</td></tr>';
}

async function carregarRelatorio() {
  const r = await api(`/relatorio?mes=${$('mes').value}`);
  $('rel-mes').textContent = r.mes.split('-').reverse().join('/');
  $('rel-receitas').textContent = moeda(r.receitas);
  $('rel-despesas').textContent = moeda(r.despesas);
  $('rel-saldo').textContent = moeda(r.saldo);
}

// ---------- Alertas ----------
async function carregarAlertas() {
  const lista = await api('/alertas');
  $('tabela-alertas').innerHTML = lista.map((a) => `
    <tr>
      <td>${a.criado_em ? new Date(a.criado_em).toLocaleString('pt-BR') : '-'}</td>
      <td>${esc(a.mensagem || '')}</td>
    </tr>`).join('') || '<tr><td colspan="2">Nenhum alerta registrado</td></tr>';
}

async function carregarTudo() {
  try {
    await Promise.all([
      carregarCategorias(), carregarLancamentos(), carregarSaldo(),
      carregarPorCategoria(), carregarRelatorio(), carregarAlertas(),
    ]);
  } catch (err) { mostrarMensagem('Não foi possível falar com a API: ' + err.message, true); }
}

carregarTudo();
