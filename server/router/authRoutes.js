import express from "express"
import { forgotPassword, getUser, login, logout, register, resetPassword, updatePassword, updateProfile } from "../controllers/authController.js"
import { isAuthenticated } from "../middleware/authMiddleware.js"

const router = express.Router()

router.post("/register", register)
router.post("/login", login)
router.post("/password/forgot", forgotPassword)

router.put("/password/reset/:token", resetPassword)
router.put("/password/update",isAuthenticated, updatePassword)
router.put("/profile/update",isAuthenticated, updateProfile)

router.get("/me",isAuthenticated, getUser)
router.get("/logout",isAuthenticated, logout)

export default router