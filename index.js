'use strict';

const request = require('request-promise');
const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
const sources = require('./resource/source.json');

function getFacebookEvents (accountName) {
  const events = [];
  function getPage (uri) {
    return request(uri)
      .then(body => {
        body = JSON.parse(body);
        events.push(...body.data);
        if (body.paging.next) {
          return getPage(body.paging.next);
        } else {
          return events;
        }
      });
  }
  return getPage(`https://graph.facebook.com/v2.8/${accountName}/events?access_token=${process.env.FB_TOKEN}&limit=100&fields=id,name,description,start_time,attending_count,place,interested_count`);
}

function checkForEvents (events) {
  // TODO: Check resistence calendar API for the event and filter out
  return events;
}

function postNewEvent (event, source) {
  return request({
    uri: process.env.SLACK_ENDPOINT,
    method: 'POST',
    json: true,
    body: {
      text: `https://www.facebook.com/events/${event.id} from ${source} (${event.attending_count} attending, ${event.interested_count} interested)`
    }
  });
}

function main () {
  Promise.all(sources['facebook'].map(function (source) {
    return getFacebookEvents(source)
      .then(events => {
        const idsFile = `/event_ids-${source}.txt`;
        const existingIds = JSON.parse(fs.readFileSync(path.join(__dirname, idsFile)));
        const newEvents = events.filter(i => !existingIds.includes(i.id));
        console.log(`Got ${events.length} events from Facebook ${source}, ${newEvents.length} of which are new`);
        existingIds.push(...newEvents.map(i => i.id));
        fs.writeFileSync(path.join(__dirname, idsFile), JSON.stringify(existingIds));
        return checkForEvents(newEvents);
      })
      .then(newEvents => {
        console.log(`Looks like ${newEvents.length} ${source} events are new`);
        newEvents.sort((a, b) => b.attending_count - a.attending_count);
        function sendNextEvent () {
          postNewEvent(newEvents.pop(), source);
          if (newEvents.length) {
            setTimeout(sendNextEvent, 1000);
          }
        }
        if (newEvents.length) sendNextEvent();
      })
    .then(() => {
      console.log(`Updates for ${source} complete`);
    });
  })).then(() => {
    console.log('All updates complete');
  });
}

function init () {
  const initializers = sources['facebook'].map(function (source) {
    return getFacebookEvents(source)
      .then(events => {
        console.log(`Initializing ${source} with ${events.length} events.`);
        fs.writeFileSync(path.join(__dirname, `/event_ids-${source}.txt`), JSON.stringify(events.map(i => i.id)));
        console.log(`Initialized ${source} with ${events.length} events.`);
      });
  });
  Promise.all(initializers).then(() => {
    console.log('Initialization complete');
  });
}

if (process.argv[2] === 'init') {
  init();
} else {
  main();
}
