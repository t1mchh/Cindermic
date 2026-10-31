const { createBackend } = require('./backend.cjs');

createBackend()
  .then((backend) => {
    console.log(`Cindermic backend: ${backend.url}`);
    console.log(`Phone audio receiver: TLS port ${backend.receiver.port}`);
    let closing = false;
    async function stop() {
      if (closing) return;
      closing = true;
      await backend.close();
      process.exit(0);
    }
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
