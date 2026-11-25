import bcrypt from 'bcryptjs'

const pw = process.argv[2]
if (!pw || pw.length < 10) {
  console.error('Uso: npm run hash-password -- "una-clave-de-al-menos-10-caracteres"')
  process.exit(1)
}
console.log(`ADMIN_PASSWORD_HASH=${bcrypt.hashSync(pw, 12)}`)
