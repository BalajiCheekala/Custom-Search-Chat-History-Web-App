const express = require("express");
const app = express();
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const path = require("path");
const port = 8080;
const axios = require("axios");
const cheerio = require("cheerio");
const Chat = require("./model/Chat.js");
const User = require("./model/cheeksUsers.js");
const session = require("express-session");
require("dotenv").config();

const API_KEY = process.env.API_KEY;
const CX = process.env.CX_ID;

app.use(session({
  secret: "your_secret_key", 
  resave: false,
  saveUninitialized: true
}));
app.use(express.json());
app.use(methodOverride("_method"));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

let historyCheck = false;
let check = false;

main()
  .then(() => {
    console.log("Connection is Successful");
  })
  .catch((err) => console.log(err));

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/AiAgent");
}
async function openHistory(req, res, next) {
  try {
    const userId = req.params.userId;  
    if (!userId) return res.status(400).send("User ID not provided");

    const history = await Chat.find({ userId });
    req.history = history;  
    req.historyCheck = history.length > 0;

    next();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading history");
  }
}
app.get("/history/:userId", openHistory, (req, res) => {
  const userId = req.params.userId;
  res.redirect(`/main/${userId}`);
});

app.get("/main/:userId", openHistory, (req, res) => {
  const userId = req.params.userId;
  const history = req.history || [];
  const historyCheck = req.historyCheck || false;
  let check = false;

  res.render("mainPage.ejs", {
    history,
    check,
    historyCheck,
    userId
  });
});

async function getFullSnippet(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const paragraphs = $("p").map((i, el) => $(el).text()).get();
    return paragraphs.slice(0, 3).join(" ");
  } catch (err) {
    return "No additional snippet available";
  }
};
app.get("/history/:userId/:id", async (req, res) => {
  try {
    const userId = req.params.userId;
    const id = req.params.id;
    const historyWithId = await Chat.findOne({ _id: id, userId: userId });
    if (!historyWithId) {
      return res.status(404).send("History not found");
    }

    const history = await Chat.find({ userId: userId });

    const query = historyWithId.title;
    const fullinfo = historyWithId.snippet;
    const check = true;
    const historyCheck = history.length > 0;

    res.render("mainPage.ejs", {
      query,
      history,
      fullinfo,
      check,
      historyCheck,
      userId
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching history");
  }
});

app.get("/:userId/logout",(req,res)=>{
  res.redirect("/");
})

app.get("/:userId/search", async (req, res) => {
  try {
    const userId = req.params.userId; 
    const query = req.query.q;
    if (!query) return res.send("No Query was Provided");

    const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${CX}&q=${encodeURIComponent(query)}&fields=items(title,link,snippet,pagemap)`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return res.send("No results found");
    }

    const results = data.items.map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      image: item.pagemap?.cse_image?.[0]?.src || null
    }));

    const curr = results[0];
    const fullinfo = await getFullSnippet(curr.link);

    await Chat.create({
      userId,  
      title: query,
      snippet: fullinfo
    });

    const check = true;

    res.render("mainPage.ejs", { query, fullinfo, check, historyCheck, userId });

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch search results", details: error.message });
  }
});


app.get("/",(req,res)=>{
  res.render("login.ejs");

})

app.get("/login", async (req, res) => {
  try {
    const { loginEmail, loginPassword } = req.query; 

    const user = await User.findOne({ email: loginEmail });

    if (!user) {
      return res.status(400).send("User not found");
    }

    if (user.password !== loginPassword) {
      return res.status(401).send("Invalid password");
    }
    const userId = loginEmail.split("@")[0];

    res.redirect(`/main/${userId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong");
  }
});


app.get("/loginSignup",(req,res)=>{
  res.render("loginSignup.ejs");
})

app.get("/loginForgotPassword",(req,res)=>{
  res.render("loginForgotPassword.ejs");
})
app.get("/loginPasswordChange/:email", (req, res) => {
  const email = req.params.email;
  const otp = req.query.otp; 

  if (otp != 1234) {
    res.render("loginForgotPasswdValidation.ejs", { email });
  } else {
    res.render("PasswordCreation.ejs", { email });
  }
});


app.get("/loginForgotPasswordValidation", async (req, res) => {
  const email = req.query.email;
  const user = await User.findOne({ email });

  if (user == null) {
    res.render("loginForgotPassword.ejs");
  } else {
    res.render("loginForgotPasswdValidation.ejs", { email });
  }
});
app.put("/forgotPasswordUpdate/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const { newPassword } = req.body;
    const user = await User.findOneAndUpdate(
      { email: email },        
      { password: newPassword }, 
      { new: true }         
    );   
    res.redirect("/"); 
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong");
  }
});


app.post("/loginSignup", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userId = email.split("@")[0];

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send("User already exists with this email");
    }
    const newUser = await User.create({
      email,
      password,
      userId
    });

    res.redirect(`/main/${userId}`);

  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Something went wrong" });
  }
});


app.listen(port, () => {
  console.log("Server is Running on http://localhost:" + port);
})




