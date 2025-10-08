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

export const fetchAllProducts = catchAsyncErrors(async(req,res,next)=>{
  const {availability, price, ratings, search, category} = req.query;

  const page = parseInt(req.query.page) || 1

  const limit = 10
  const offset =(page-1)*limit

  const conditions = []
  let values =[]
  let index =1

  let paginationPlaceHolder = {}

  //Avalibalility filter products
  if(availability === "in-stock"){
    conditions.push(`stock > 5`)
  }else if(availability === "limited"){
    conditions.push(`stock > 0 AND stock <= 5`)
  }else if(availability === "out-of-stock"){
    conditions.push(`stock = 0`)
  }

  //filter products by price
  if(price){
    const [minPrice, maxPrice] = price.split("-")
    if(minPrice && maxPrice){
      conditions.push(`price BETWEEN $${index} AND $${index+1}`)
      values.push(minPrice,maxPrice)
      index+=2;
    }
  }

  //filter products by category
  if(category){
    conditions.push(`category ILIKE $${index}`)
    values.push(`%${category}%`)
    index++
  }

  //filter by ratings
  if(ratings){
    conditions.push(`ratings >= $${index}`)
    values.push(ratings)
    index++
  }

  //search functionality
  if(search){
    conditions.push(`(p.name ILIKE $${index} OR p.description ILIKE $${index})`)
    values.push(`%${search}%`)
    index++
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""

  //get count of filtered products
  const totalProductResult = await database.query(`SELECT COUNT(*) FROM products p ${whereClause}`,values)

  const totalProducts = parseInt(totalProductResult.rows[0].count)

  paginationPlaceHolder.limit = `$${index}`
  values.push(limit)
  index++

  paginationPlaceHolder.offset = `$${index}`
  values.push(offset)
  index++

  //fetch with reviews
  const query = `SELECT p.*, 
  COUNT(r.id) AS review_count 
  FROM products p 
  LEFT JOIN reviews r ON p.id = r.product_id ${whereClause} 
  GROUP BY p.id 
  ORDER BY p.created_at DESC 
  LIMIT ${paginationPlaceHolder.limit} 
  OFFSET ${paginationPlaceHolder.offset}`

  const result = await database.query(query,values)

  const newProductQuery = `
  SELECT p.*, 
  COUNT(r.id) AS review_count 
  FROM products p 
  LEFT JOIN reviews r ON p.id = r.product_id 
  WHERE p.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY p.id
  ORDER BY p.created_at DESC
  LIMIT 8`

  const newProductsResult = await database.query(newProductQuery)

  const topRateQuery = `
  SELECT p.*, COUNT(r.id) AS review_count 
  FROM products p 
  LEFT JOIN reviews r ON p.id = r.product_id 
  WHERE p.ratings >= 4.5  
  GROUP BY p.id 
  ORDER BY p.ratings DESC, p.created_at DESC 
  LIMIT 8`

  const topRatedResult = await database.query(topRateQuery)

  res.status(200).json({
    success:true, 
    products: result.rows, 
    totalProducts, 
    newProducts: newProductsResult.rows, 
    topRatedProducts:topRatedResult.rows
  })

})

export const updateProduct = catchAsyncErrors(async(req,res,next)=>{
  const {productId} = req.params
  const {name,description,category,stock,price} = req.body;

   if(!name || !description || !price || !category || !stock){
    return next(new ErrorHandler("Please provide all the required fields.",400))
  }

  const product = await database.query(`SELECT * FROM products WHERE id = $1`,[productId])

  if(product.rows.length === 0){
    return next(new ErrorHandler("Product not found.", 404))
  }

  const result = await database.query(`UPDATE products SET name = $1, description = $2, price= $3, category = $4, stock = $5 WHERE id= $6 RETURNING *`,[name,description,price,category,stock,productId])

  res.status(200).json({
    success:true,
    message:"Product updated succesfully.",
    updatedProduct: result.rows[0],
    })
})

export const deleteProduct = catchAsyncErrors(async(req,res,next)=>{
  const {productId} = req.params;

  const product = await database.query(`SELECT * FROM products WHERE id = $1`,[productId])

  if(product.rows.length === 0){
    return next(new ErrorHandler("Product not found.", 404))
  }

  const images = product.rows[0].images

  const deleteResult = await database.query(`DELETE FROM products WHERE id=$1 RETURNING *`,[productId])

  if(deleteResult.rows.length === 0){
    return next(new ErrorHandler("Failed to delete products.",500))
  }

  //delete images from cloudinary
  if(images && images.length > 0){
    for(const image of images){
      await cloudinary.uploader.destroy(image.public_id)
    }
  }

  res.status(200).json({
    success:true,
     message:"Product deleted succesfully!",
     deleteProduct: deleteResult.rows[0]
    })

})