FROM nginx:1.27-alpine
# Versão exibida no rodapé. Para gerar a v2: docker build --build-arg VERSAO=v2 ...
ARG VERSAO=v1
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js /usr/share/nginx/html/
RUN sed -i "s/__VERSAO__/${VERSAO}/" /usr/share/nginx/html/index.html
EXPOSE 80
