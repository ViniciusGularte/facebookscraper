import { signIn, signUp } from "../lib/supabaseAuth.mjs";

const err = document.getElementById("err");
const ok = document.getElementById("ok");

function showErr(msg) {
  ok.classList.add("hidden");
  err.textContent = msg;
  err.classList.remove("hidden");
}

function showOk(msg) {
  err.classList.add("hidden");
  ok.textContent = msg;
  ok.classList.remove("hidden");
}

function getCreds() {
  return {
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("password").value.trim()
  };
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const { email, password } = getCreds();
  try {
    await signIn(email, password);
    window.location.href = "../dashboard/dashboard.html";
  } catch {
    showErr("Falha no login.");
  }
});

document.getElementById("signupBtn").addEventListener("click", async () => {
  const { email, password } = getCreds();
  try {
    const r = await signUp(email, password);
    if (r?.access_token) {
      window.location.href = "../dashboard/dashboard.html";
      return;
    }
    showOk("Cadastro criado. Pode exigir confirmação de email.");
  } catch {
    showErr("Falha no cadastro.");
  }
});
