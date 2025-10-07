import {catchAsyncErrors} from "../middleware/catchAsyncError.js"
import ErrorHandler from "../middleware/errorMiddleware.js"
import database from "../db/db.js"
import {v2 as cloudinary} from "cloudinary"

export const createProduct = catchAsyncErrors(async(req,res,next)=>{
  const {name,description,price,category,stock} = req.body
  const created_by =req.user.id;

  if(!name || !description || !price || !category || !stock){
    return next(new ErrorHandler("Please provide all the required fields.",400))
  }

  let uploadedImages = []
  if(req.files && req.files.images){
    const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images]

    for(const image of images){
      const result = await cloudinary.uploader.upload(image.tempFilePath,{
        folder:"shopMate",
        width:100,
        crop:"scale"
      })

      uploadedImages.push({
        url:result.secure_url,
        public_id:result.public_id,
      })
    }
  }

  const product = await database.query(`INSERT INTO products (name,description,price,category,stock,images,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[name,description,price,category,stock,JSON.stringify(uploadedImages),created_by])

  res.status(201).json({success:true, message:"Product created succesfully!", product: product.rows[0]})

})