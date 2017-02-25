Simple scraper to post new Resistance Calendar events to slack.

There's no database, it just uses the filesystem to remember which events it's seen before.

Setup:

1. Run `npm install` to install dependencies
2. Set `FB_TOKEN` and `SLACK_ENDPOINT` environment variables
3. Run `node index.js init` to generate an initial list of event IDs
4. Run `node index.js` to check for new events and post to Slack if we find any (you probably want to add this command to a crontab or something)