import {catchAsyncErrors} from "../middleware/catchAsyncError.js"
import ErrorHandler from "../middleware/errorMiddleware.js"
import database from "../db/db.js"
import {v2 as cloudinary} from "cloudinary"
import { getAIRecommendation } from "../utils/getAIRecommendation.js"

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

export const fetchSingleProduct = catchAsyncErrors(async(req,res,next)=>{
  const {productId} = req.params

  const result = await database.query(`
    SELECT p.*, 
    COALESCE(json_agg(
    json_build_object(
    'review_id', r.id,
    'rating', r.rating,
    'comment', r.comment,
    'reviewer', json_build_object(
    'id',u.id ,
    'name',u.name,
    'avatar',u.avatar
    )  ) )
    FILTER (WHERE r.id IS NOT NULL), '[]') AS reviews 
    FROM products p LEFT JOIN reviews r ON p.id=r.product_id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE p.id =$1
    GROUP BY p.id`,[productId])

    res.status(200).json({
      success:true, 
      message:"Product fetched succesfully.", 
      product: result.rows[0]
    })
})

export const postProductReview = catchAsyncErrors(async(req,res,next)=>{
  const {productId} = req.params;
  const {rating,comment} = req.body

  if(!rating || !comment){
    return next(new ErrorHandler("Please provide rating and comment.",400))
  }

  const purchasedCheckQuery = `
  SELECT oi.product_id 
  FROM order_items oi 
  JOIN orders o ON oi.id = oi.order_id
  JOIN payments p ON p.order_id = o.id
  WHERE o.buyer_id = $1
  AND oi.product_id = $2
  AND p.payment_status = 'Paid'
  LIMIT 1
  `

  const {rows} = await database.query(purchasedCheckQuery,[req.user.id, productId])

  if(rows.length ===0){
    return res.status(403).json({success:false, message:"You can only review a product if you have purachsed it."})
    // return next(new ErrorHandler("You can only review product if you have purchased.",403))
  }

  const product = await database(`SELECT * FROM products WHERE id = $1`,[productId])

  if(product.rows.length === 0){
    return next(new ErrorHandler("Product not found.",404))
  }

  const isAlreadyReviewed = await database(`
    SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2
    `,[productId, req.user.id])

    let review;
    if(isAlreadyReviewed.rows.length > 0){
      review = await database.query(`UPDATE reviews SET rating = $1, comment = $2 WHERE product_id = $3 AND user_id=$4 RETURNING *`,[rating, comment, productId, req.user.id])
    }else{
       review = await database.query(`INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1,$2,$3,$4) RETURNING *`,[productId, req.user.id, rating, comment])
    }

    const allReviews = await database.query(`SELECT AVG(rating) AS avg_rating FROM reviews WHERE product_id = $1`,[productId])

    const newAvgRating = allReviews.rows[0].avg_rating;

    const updatedProduct = await database.query(`
      UPDATE products SET ratings = $1 WHERE id =$2 RETURNING *
      `,[newAvgRating,productId])

      res.status(200).json({
        success:true, 
        message:"Review posted succesfully!",
        review:review.rows[0], 
        product: updatedProduct.rows[0]
      })

})

export const deleteReview = catchAsyncErrors(async(req,res,next) =>{
  const {productId} = req.params

  const review = await database.query(`DELETE FROM reviews WHERE product_id = $1 AND user_id=$2 RETURNING *`,[productId, req.user.id])

  if(review.rows.length === 0){
    return next(new ErrorHandler("Review not found.",404))
  }

  const allReviews = await database.query(`SELECT AVG(rating) AS avg_rating FROM reviews WHERE product_id = $1`,[productId])

    const newAvgRating = allReviews.rows[0].avg_rating;

    const updatedProduct = await database.query(`
      UPDATE products SET ratings = $1 WHERE id =$2 RETURNING *
      `,[newAvgRating,productId])

      res.status(200).json({
        success:true, 
        message:"Your review has been deleted!", 
        review:review.rows[0],
        product: updateProduct.rows[0]
      })
})

export const fetchAIFilteredProducts = catchAsyncErrors(async(req,res,next)=>{
  const {userPrompt} = req.body

  if(!userPrompt){
    return next(new ErrorHandler("Provide a valid prompt.",400))
  }

  const filterKeywords = (query) =>{
    const stopWords = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am",
  "an", "and", "any", "are", "aren't", "as", "at", "be", "because",
  "been", "before", "being", "below", "between", "both", "but", "by",
  "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does",
  "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
  "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't",
  "having", "he", "he'd", "he'll", "he's", "her", "here", "here's",
  "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or",
  "other", "ought", "our", "ours", "ourselves", "out", "over", "own",
  "same", "shan't", "she", "she'd", "she'll", "she's", "should",
  "shouldn't", "so", "some", "such", "than", "that", "that's", "the",
  "their", "theirs", "them", "themselves", "then", "there", "there's",
  "these", "they", "they'd", "they'll", "they're", "they've", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was",
  "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
  "what", "what's", "when", "when's", "where", "where's", "which", "while",
  "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your",
  "yours", "yourself", "yourselves"
]);

  return query.toLowerCase().replace(/[^\w\s]/g,"").split(/\s+/).filter(word => !stopWords.has(word)).map(word => `%${word}%`)
  }

  const keywords = filterKeywords(userPrompt)

  //Basic SQL Filtering
  const result = await database.query(`
    SELECT * FROM products 
    WHERE name ILIKE ANY($1)
    OR description ILIKE ANY($1) 
    OR category ILIKE ANY($1) 
    LIMIT 200;`,[keywords])

    const filteredProducts = result.rows;

    if(filteredProducts.length === 0){
      return res.status(200).json({
        success:true,
        message:"No product found matching your prompt.",
        products:[]
      })
    }

    //AI Filtering
    const {success, products} = await getAIRecommendation(req,res,userPrompt,filteredProducts)

    res.status(200).json({
      success:success,
      message:"AI filtered products.",
      products,
    })
})