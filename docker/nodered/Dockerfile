FROM nodered/node-red:latest

USER node-red
WORKDIR /usr/src/node-red

# Install in the runtime directory so the /data bind mount cannot hide nodes.
# Read the version from the same manifest used by the Node-RED user directory.
COPY --chown=node-red:node-red data/package.json /tmp/greenmesh-package.json
RUN npm install --omit=dev --no-audit --no-fund "node-red-contrib-modbus@$(node -p 'require("/tmp/greenmesh-package.json").dependencies["node-red-contrib-modbus"]')"
