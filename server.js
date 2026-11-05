import { startServer, lanAddresses } from './server/app.js';

const { port } = await startServer({ port: Number(process.env.PORT) || 3000 });
console.log(`Lokalnie: http://localhost:${port}`);
for (const url of lanAddresses(port)) console.log(`LAN: ${url}`);
