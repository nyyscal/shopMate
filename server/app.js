import express from "express"
import { config } from "dotenv"
import cors from "cors"
import cookieParser from "cookie-parser"
import fileUpload from "express-fileupload"

import { createTables } from "./utils/createTables.js"
import { errorMiddleware } from "./middleware/errorMiddleware.js"

import authRouter from "./router/authRoutes.js"
import productRouter from "./router/productRoutes.js"
import adminRouter from "./router/adminRoutes.js"

const app = express()

config({path:"./config/config.env"})

app.use(express.json())
app.use(cors({
  origin:[process.env.FRONTEND_URL, process.env.DASHBOARD_URL],
  methods:["GET", "POST", "PUT", "DELETE"],
  credentials:true,
}))
app.use(cookieParser())
app.use(express.urlencoded({extended:true}))
app.use(fileUpload({
  tempFileDir:"./uploads",
  useTempFiles:true,
}))

createTables()

app.use(errorMiddleware)

app.use("/api/v1/auth",authRouter)
app.use("/api/v1/product",productRouter)
app.use("/api/v1/admin",adminRouter)

export default app
