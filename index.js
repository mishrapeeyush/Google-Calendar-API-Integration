// index.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { google } from "googleapis";
import axios from "axios";
import dayjs from "dayjs";
import mongoose from "mongoose";

// Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/google_calendar_app", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8000;
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URL
);
const calendar = google.calendar({ version: "v3" });
const scopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];


// MongoDB schema and model for storing user information
const userSchema = new mongoose.Schema({
  gmailUsername: {
    type: String,
    unique: true,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
});

const User = mongoose.model("User", userSchema);

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  if (oauth2Client.credentials) {
    // Authenticated
    next();
  } else {
    // Not authenticated
    res.status(401).send({
      error: "Authentication required",
    });
  }
};

app.get("/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    client_id: process.env.CLIENT_ID,
    response_type: "code",
    redirect_uri: "http://localhost:8000/google/redirect",
  });
  res.redirect(url);
});

app.get("/google/redirect", async (req, res) => {
  try {
    const code = req.query.code;
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    // Use the Google Auth API to retrieve the authenticated user's email
    const userInfo = await google.oauth2("v2").userinfo.get({
      auth: oauth2Client,
    });
    const gmailUsername = userInfo.data.email;

    // Check if the user already exists in the database
    let user = await User.findOne({ gmailUsername });

    if (!user) {
      // If the user doesn't exist, create a new record in the database
      user = new User({
        gmailUsername,
        refreshToken: tokens.refresh_token,
      });
    } else {
      // If the user exists, update their refresh token
      user.refreshToken = tokens.refresh_token;
    }

    // Save the user's information to the database
    await user.save();

    res.send({
      msg: "You have successfully logged in",
    });
  } catch (error) {
    console.error("Error during authentication:", error);
    res.status(500).send({
      error: "An error occurred during authentication",
    });
  }
});

app.post("/schedule_event", async (req, res) => {
  const { start, end, summary, description, repeat, timeZone, gmailUsername } = req.body;
  const eventStartTime = start
    ? dayjs(start).toISOString()
    : dayjs().add(1, "day").startOf("hour").add(10, "minutes").toISOString();
  const eventEndTime = end
    ? dayjs(end).toISOString()
    : dayjs(eventStartTime).add(1, "hour").toISOString();

    const event = {
      summary: summary || "This is a test event",
      description: description || "Some event which is very very important",
      start: {
        dateTime: eventStartTime,
        timeZone: timeZone || "UTC", 
      },
      end: {
        dateTime: eventEndTime,
        timeZone: timeZone || "UTC", 
      },
      recurrence: repeat === "daily" ? ["RRULE:FREQ=DAILY"] : [],
    };

  try {
    // Get the user's refresh token from the database based on their Gmail account username
    const user = await User.findOne({ gmailUsername });

    if (!user) {
      throw new Error("User not found");
    }

    oauth2Client.setCredentials({ refresh_token: user.refreshToken });
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      auth: oauth2Client,
    });
    console.log("Event created:", response.data);
    res.send({
      msg: "Event created successfully",
      eventId: response.data.id,
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).send({
      error: "An error occurred while creating the event",
    });
  }
});

app.get("/find_events", async (req, res) => {
  const { start, end, gmailUsername } = req.query;

  try {
    // Get the user's refresh token from the database based on their Gmail account username
    const user = await User.findOne({ gmailUsername });

    if (!user) {
      throw new Error("User not found");
    }

    oauth2Client.setCredentials({ refresh_token: user.refreshToken });
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: `${start}T00:00:00.000Z`,
      timeMax: `${end}T23:59:59.999Z`.replace(/\n/g, ""),
      auth: oauth2Client,
    });
    console.log("Events found:", response.data.items);
    res.send({
      msg: "Events found successfully",
      events: response.data.items,
    });
  } catch (error) {
    console.error("Error finding events:", error);
    res.status(500).send({
      error: "An error occurred while finding events",
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
