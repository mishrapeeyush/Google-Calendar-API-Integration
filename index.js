import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { google } from "googleapis";
import axios from "axios";
import dayjs from "dayjs";

const app = express();

const PORT = process.env.PORT || 8000;

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URL
);

const calendar = google.calendar({ version: "v3" });

const scopes = ["https://www.googleapis.com/auth/calendar.events"];

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
  });
  res.redirect(url);
});

app.get("/google/redirect", async (req, res) => {
  const code = req.query.code;

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  res.send({
    msg: "You have successfully logged in",
  });
});

app.get("/schedule_event", checkAuth, async (req, res) => {
  const { start, end, summary, description, repeat } = req.query;

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
      timeZone: "Asia/Kolkata",
    },
    end: {
      dateTime: eventEndTime,
      timeZone: "Asia/Kolkata",
    },
    recurrence: repeat === "daily" ? ["RRULE:FREQ=DAILY"] : [],
  };

  try {
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

app.get("/find_events", checkAuth, async (req, res) => {
  const { start, end } = req.query;

  try {
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
