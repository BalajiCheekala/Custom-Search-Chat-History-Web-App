const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  userId:   { type: String,required: true },
  title:    { type: String, required: true },
  snippet:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});



const Chat = mongoose.model("Chat", chatSchema);

module.exports = Chat;

