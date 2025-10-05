import ErrorHandler from "../middleware/errorMiddleware.js";
import {catchAsyncErrors} from "../middleware/catchAsyncError.js"
import database from "../db/db.js";
import bcrypt from "bcrypt"
import { sendToken } from "../utils/jwtToken.js";

export const register = catchAsyncErrors(async(req,res,next) =>{
  const {name,email, password} = req.body

  if(!name || !email || !password) {
    return next(new ErrorHandler("Please provider all required fields.",400))
  }

  const existingUser = await database.query(`
    SELECT * FROM users WHERE email = $1`,
    [email]
    )

  if(existingUser.rows.length > 0){
    return next(new ErrorHandler("User already registered!",400))
  }

  const hashedPassword = await bcrypt.hash(password,10)
  const user = await database.query(`
    INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *`,
    [name,email,hashedPassword])

    sendToken(user.rows[0], 201, "User registered succesfully!", res)
})

export const login = catchAsyncErrors(async(req,res,next) =>{

})
export const getUser = catchAsyncErrors(async(req,res,next) =>{

})
export const logout = catchAsyncErrors(async(req,res,next) =>{

})