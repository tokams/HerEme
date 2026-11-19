'use strict';

async function listenAvailable(app, { port, host = '0.0.0.0', attempts = 20, onBusy = () => {} }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid starting port.');
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error('Invalid listen attempt limit.');
  const last = Math.min(65535, port + attempts - 1);
  for (let candidate = port; candidate <= last; candidate++) {
    try {
      return await new Promise((resolve, reject) => {
        const server = app.listen(candidate, host);
        const onError = error => { server.removeListener('listening', onListening); reject(error); };
        const onListening = () => { server.removeListener('error', onError); resolve(server); };
        server.once('error', onError);
        server.once('listening', onListening);
      });
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      onBusy(candidate);
    }
  }
  throw new Error(`No available port in ${port}-${last}. Set PORT to another starting port.`);
}
module.exports = { listenAvailable };
