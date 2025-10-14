// server.js
import chokidar from "chokidar";
import { exec } from "child_process";

const watcher = chokidar.watch(".", {
  ignored: ["node_modules", ".git", ".next"],
  persistent: true,
});

watcher.on("change", (path) => {
  console.log(`Arquivo alterado: ${path}`);
  exec('git add . && git commit -m "Auto commit" && git push', (err, stdout, stderr) => {
    if (err) console.error("Erro no git:", err);
    else console.log("Commit e push enviados para GitHub ✅");
  });
});

console.log("🚀 Monitorando alterações e enviando para GitHub...");