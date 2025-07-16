FROM docker.n8n.io/n8nio/n8n:latest
USER root
RUN apk add --no-cache ffmpeg curl
RUN apk add --no-cache python3 py3-pip
RUN pip3 install beautifulsoup4
RUN chown -R node:node /home/node/.n8n
USER node
