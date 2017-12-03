Simple scraper to post new Resistance Calendar events to slack run as a cron process.

On initialization the process will lazily initialize the database with existing events from the main resistence calendar facebook page. Afterwards a the resource/source.json file is read to scrape each facebook account page to gather the events listed and post to the relevant slack page.
