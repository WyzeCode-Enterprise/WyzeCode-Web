import { exec } from "child_process";
import chokidar from "chokidar";
import path from "path";

const repoPath = path.resolve("."); // pasta do seu projeto local
const branch = "main"; // ajuste se for outra branch
let pushing = false;

// Função para commit + push
const commitAndPush = () => {
  if (pushing) return; // evita push duplicado
  pushing = true;

  const cmd = `
    git -C "${repoPath}" add . &&
    git -C "${repoPath}" commit -m "Atualização automática" &&
    git -C "${repoPath}" push origin ${branch} --force
  `;

  exec(cmd, (err, stdout, stderr) => {
    if (err) console.error("Erro no push automático:", err);
    else console.log("✅ Commit e push automático enviados:", new Date().toLocaleTimeString());
    pushing = false;
  });
};

// Monitora **todas as alterações** na pasta do projeto (exceto node_modules e .git)
const watcher = chokidar.watch(repoPath, {
  ignored: [".git", "node_modules"],
  persistent: true,
});

watcher.on("all", () => {
  console.log("Alteração detectada, enviando para GitHub...");
  commitAndPush();
});

console.log("🚀 Monitorando alterações locais e enviando para GitHub em tempo real...");