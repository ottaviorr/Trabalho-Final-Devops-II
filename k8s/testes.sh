#!/usr/bin/env bash
# Testes K5 a K8 no cluster.
# Uso: bash k8s/testes.sh <usuario-dockerhub>
set -e

USUARIO=${1:?Informe o usuário do Docker Hub. Ex.: bash k8s/testes.sh meuusuario}
URL=http://localhost:30080

pausa() { read -rp $'\n>> Enter para continuar...'; echo; }
titulo() { echo; echo "=================== $1 ==================="; }

titulo "Estado inicial"
kubectl get deployments
kubectl get pods -o wide
pausa

titulo "K5 - Falha da API"
POD=$(kubectl get pods -l app=api -o jsonpath='{.items[0].metadata.name}')
echo "Apagando o pod $POD"
kubectl delete pod "$POD" --wait=false
echo "Sistema continua respondendo durante a recriação:"
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "  /api/health -> HTTP %{http_code}\n" "$URL/api/health" || true
  sleep 1
done
kubectl wait --for=condition=Ready pod -l app=api --timeout=90s
kubectl get pods -l app=api
pausa

titulo "K6 - Persistência do banco"
echo "Antes:"; curl -s "$URL/api/relatorio"; echo
kubectl delete pod -l app=mongo
kubectl wait --for=condition=Ready pod -l app=mongo --timeout=120s
kubectl get pods -l app=mongo
sleep 3
echo "Depois:"; curl -s "$URL/api/relatorio"; echo
pausa

titulo "K7 - Escala da API"
kubectl scale deployment api --replicas=3
kubectl rollout status deployment api
kubectl get pods -l app=api
echo "Voltando para 2 réplicas"
kubectl scale deployment api --replicas=2
kubectl get deployment api
pausa

titulo "K8 - Atualização do frontend para v2"
# Requisições contínuas durante a atualização para mostrar que não há interrupção
( for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " "$URL/" || true; sleep 0.5; done; echo ) &
kubectl set image deployment/frontend frontend="$USUARIO/financas-frontend:v2"
kubectl rollout status deployment frontend
wait
echo "Rodapé agora:"; curl -s "$URL/" | grep -o "Versão v[0-9]*"
kubectl rollout history deployment frontend
pausa

titulo "K8 - Retorno para v1"
kubectl rollout undo deployment frontend
kubectl rollout status deployment frontend
echo "Rodapé agora:"; curl -s "$URL/" | grep -o "Versão v[0-9]*"

titulo "Testes concluídos"
