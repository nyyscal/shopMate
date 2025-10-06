import crypto from "crypto"

export const generateResetPasswordToken = () =>{
  const resetToken = crypto.randomBytes(20).toString("hex")

  const hashedPassword = crypto.createHash("sha256").update(resetToken).digest("hex")

  const resetPasswordExpireTime = Date.now() + 15 * 60 * 1000;

  return {resetPasswordExpireTime, resetToken, hashedPassword}
}