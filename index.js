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

  getFacebookEvents('resistance-calendar')
    .then(events => {
      const upcomingEvents = events.filter(event => {
        const eventStartTime = new Date(event.start_time);
        return eventStartTime > now;
      });

      upcomingEvents.forEach(function (event) {
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
      sources['facebook'].forEach(function (source) {
        return getFacebookEvents(source)
          .then(events => {
            const upcomingEvents = events.filter(event => {
              const eventStartTime = new Date(event.start_time);
              return eventStartTime > now;
            });

            console.log(`Found ${upcomingEvents.length} upcoming events for ${source}.`);
            upcomingEvents.sort((a, b) => b.attending_count - a.attending_count);

            function sendNextEvent () {
              const event = upcomingEvents.pop();
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
              if (upcomingEvents.length) {
                setTimeout(sendNextEvent, 1000);
              }
            }
            if (upcomingEvents.length) sendNextEvent();
          })
          .then(() => {
            console.log(`Updates for ${source} complete`);
          });
      });
    });
}

main();
