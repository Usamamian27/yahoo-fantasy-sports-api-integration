require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const YahooFantasy = require("yahoo-fantasy");
const xml2js = require("xml2js");

const app = express();
const port = 3000;

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "99032842nkjhkrhwkfhekrhjgkehrkheioihtkhtieruti",
    resave: false,
    saveUninitialized: true,
  })
);

app.yf = new YahooFantasy(
  process.env.YAHOO_CLIENT_ID,
  process.env.YAHOO_CLIENT_SECRET,
  async ({ access_token, refresh_token }) => {
    // Store tokens in a way accessible to routes
    app.locals.temp_access_token = access_token;
    app.locals.temp_refresh_token = refresh_token;
    console.log("Access Token:", access_token);
    console.log("Refresh Token:", refresh_token);
  },
  process.env.YAHOO_REDIRECT_URI
);

// Route to start OAuth process
app.get("/auth/yahoo", (req, res) => {
  app.yf.auth(res);
});

// OAuth callback route
app.get("/auth/yahoo/callback", (req, res) => {
  app.yf.authCallback(req, (err) => {
    if (err) {
      console.error("Authentication callback error:", err);
      return res.redirect("/error");
    }
    // Store tokens in session
    req.session.access_token = app.locals.temp_access_token;
    req.session.refresh_token = app.locals.temp_refresh_token;
    res.redirect("/");
  });
});

// Home route to display authentication status
app.get("/", (req, res) => {
  if (req.session.access_token) {
    res.send(
      "Hello, you are authenticated with Yahoo Fantasy Sports!<br>" +
        '<a href="/fetch-leagues">Fetch Leagues</a><br>' +
        '<a href="/fetch-game">Fetch Game Data</a><br>' +
        '<a href="/fetch-league/449.l.66919">Fetch Single League</a>'
    );
  } else {
    res.send('<a href="/auth/yahoo">Login with Yahoo Fantasy Sports</a>');
  }
});

// Route to fetch all leagues for the authenticated user
app.get("/fetch-leagues", async (req, res) => {
  if (!req.session.access_token) {
    return res.redirect("/auth/yahoo");
  }

  try {
    const response = await axios.get(
      `https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues`,
      {
        headers: {
          Authorization: `Bearer ${req.session.access_token}`,
        },
      }
    );

    // Log the response data for inspection
    console.log("Response Data:", response.data);

    // Parse and extract the league_key(s) from the response
    const parser = new xml2js.Parser();
    parser.parseString(response.data, (err, result) => {
      if (err) {
        console.error("Error parsing XML:", err);
        return res.status(500).send("Failed to parse league info");
      }

      // Log the parsed result for inspection
      console.log("Parsed Result:", JSON.stringify(result, null, 2));

      // Extract league keys from the parsed result
      const users = result.fantasy_content.users[0].user;
      const leagueData = [];

      users.forEach((user) => {
        const games = user.games[0].game;
        games.forEach((game) => {
          if (game.leagues && game.leagues[0].league) {
            const leagues = game.leagues[0].league;
            leagues.forEach((league) => {
              leagueData.push({
                league_key: league.league_key[0],
                league_name: league.name[0],
                league_url: league.url[0],
                num_teams: league.num_teams[0],
                draft_status: league.draft_status[0],
                scoring_type: league.scoring_type[0],
                current_week: league.current_week[0],
                start_week: league.start_week[0],
                end_week: league.end_week[0],
              });
            });
          }
        });
      });

      res.json({ leagues: leagueData });
    });
  } catch (error) {
    console.error(
      "Error fetching leagues:",
      error.response ? error.response.data : error.message
    );
    res.status(500).send("Failed to fetch leagues");
  }
});

// Example route to fetch specific league info using the league_key
app.get("/fetch-league/:league_key", async (req, res) => {
  const leagueKey = req.params.league_key;

  if (!req.session.access_token) {
    return res.redirect("/auth/yahoo");
  }

  try {
    const response = await axios.get(
      `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}`,
      {
        headers: {
          Authorization: `Bearer ${req.session.access_token}`,
        },
      }
    );

    // Parse the XML response to JSON
    const parser = new xml2js.Parser();
    parser.parseString(response.data, (err, result) => {
      if (err) {
        console.error("Error parsing XML:", err);
        return res.status(500).send("Failed to parse league info");
      }

      res.json(result);
    });
  } catch (error) {
    console.error(
      "Error fetching league info:",
      error.response ? error.response.data : error.message
    );
    res.status(500).send("Failed to fetch league info");
  }
});

app.get("/fetch-game", async (req, res) => {
  if (!req.session.access_token) {
    return res.redirect("/auth/yahoo");
  }

  try {
    const response = await axios.get(
      `https://fantasysports.yahooapis.com/fantasy/v2/game/nfl`,
      {
        headers: {
          Authorization: `Bearer ${req.session.access_token}`,
        },
      }
    );

    // Parse and extract game data from the response
    const parser = new xml2js.Parser();
    parser.parseString(response.data, (err, result) => {
      if (err) {
        console.error("Error parsing XML:", err);
        return res.status(500).send("Failed to parse game info");
      }

      // Extract game data from the parsed result
      const gameData = result.fantasy_content.game[0];
      res.json(gameData);
    });
  } catch (error) {
    console.error(
      "Error fetching game data:",
      error.response ? error.response.data : error.message
    );
    res.status(500).send("Failed to fetch game data");
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
