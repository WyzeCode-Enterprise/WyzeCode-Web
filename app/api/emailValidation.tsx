export function validateEmail(email: string): { valid: boolean; message?: string } {
  if (!email || email.trim() === "") {
    return { valid: false, message: "O campo de email não pode estar vazio." }
  }

  const atIndex = email.indexOf("@")
  if (atIndex === -1) {
    return { valid: false, message: "O endereço de email informado é inválido." }
  }

  const local = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1)

  if (!local) {
    return { valid: false, message: "A parte antes do '@' está vazia. Verifique seu endereço de email." }
  }

  if (!domain.includes(".")) {
    return { valid: false, message: "O endereço de email informado é inválido." }
  }

  const dotIndex = domain.lastIndexOf(".")
  const tld = domain.slice(dotIndex + 1)
  if (!tld) {
    return { valid: false, message: "O endereço de email informado é inválido." }
  }

  return { valid: true }
}

export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (!password || password.trim() === "") {
    return { valid: false, message: "O campo de senha não pode estar vazio." }
  }
  if (password.length < 8) {
    return { valid: false, message: "A senha deve ter no mínimo 8 caracteres." }
  }
  return { valid: true }
}