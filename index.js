'use strict';

const request = require('request-promise');
const mongoose = require('mongoose');
const Promise = require('bluebird');
const sources = require('./resource/source.json');

const FacebookEvent = mongoose.model('FacebookEvent', mongoose.Schema({
  id: String
}));

/*
 * Use mongo db to store visited event IDs
 */
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rc_test';
const db = mongoose.createConnection(mongoUri, {promiseLibrary: Promise});
mongoose.connect(mongoUri);

db.on('error', console.error.bind(console, 'connection error'));
db.once('open', function callback () {
  console.log('Connection with database succeeded.');
});

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

function postNewEvent (source, event) {
  if (source === 'resistance-calendar') {
    return Promise.resolve(null);
  } else {
    return request({
      uri: process.env.SLACK_ENDPOINT,
      method: 'POST',
      json: true,
      body: {
        text: `${source}: <https://www.facebook.com/events/${event.id}|${event.name}> (${event.attending_count} attending, ${event.interested_count} interested)`
      }
    });
  }
}

function main () {
  const now = new Date();

  // Lazily load all events from the resistance-calendar page to initialize the
  // database so that already added events are ignored and the process does
  // not require an additional initialization step
  getFacebookEvents('resistance-calendar')
    .then(events => {
      const upcomingEvents = events.filter(event => {
        const eventStartTime = new Date(event.start_time);
        return eventStartTime > now;
      });

      // In order to avoid posting low attended events to the slack
      // channel, only add events above some threshold of attendance.
      // Subsequent runs of this servce will eventually add the events
      // once they meet this threshold
      const attendedEvents = upcomingEvents.filter(event => {
        return event.attending_count > 5;
      });

      attendedEvents.forEach(function (event) {
        FacebookEvent.findOne({id: event.id}, function (err, doc) {
          if (err) console.err(err);
          if (!doc) {
            const mongoEvent = new FacebookEvent({id: event.id});
            mongoEvent.save(function (err) {
              if (err) console.err(err);
            });
          }
        });
      });
    }).then(() => {
      // Iterate over entries in the facebook array in the organizations list
      sources['facebook'].forEach(function (source) {
        return getFacebookEvents(source)
          .then(events => {
            const upcomingEvents = events.filter(event => {
              const eventStartTime = new Date(event.start_time);
              return eventStartTime > now;
            });

            // In order to avoid posting low attended events to the slack
            // channel, only add events above some threshold of attendance.
            // Subsequent runs of this servce will eventually add the events
            // once they meet this threshold
            const attendedEvents = upcomingEvents.filter(event => {
              return event.attending_count > 5;
            });

            console.log(`Found ${attendedEvents.length} upcoming and semi-attended events for ${source}.`);
            attendedEvents.sort((a, b) => b.attending_count - a.attending_count);

            function sendNextEvent () {
              const event = attendedEvents.pop();
              FacebookEvent.findOne({id: event.id}, function (err, doc) {
                if (err) console.err(err);
                if (!doc) {
                  postNewEvent(source, event)
                    .then(() => {
                      const mongoEvent = new FacebookEvent({id: event.id});
                      mongoEvent.save(function (err) {
                        if (err) console.err(err);
                        console.log('. ');
                      });
                    });
                }
              });
              if (attendedEvents.length) {
                setTimeout(sendNextEvent, 1000);
              }
            }
            if (attendedEvents.length) sendNextEvent();
          })
          .then(() => {
            console.log(`Updates for ${source} complete`);
          });
      });
    });
}

main();
