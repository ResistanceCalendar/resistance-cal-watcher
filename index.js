"use strict";

const request = require("request-promise");
const fs = require("fs");
const ical = require("ical");
const Promise = require("bluebird");
Promise.promisifyAll(ical, {suffix: "Promise"})

function getEvents() {
  const events = [];
  function getPage(uri) {
    return request(uri)
      .then(body => {
        body = JSON.parse(body);
        events.push(...body.data);
        if (body.paging.next) {
          return getPage(body.paging.next);
        } else {
          return events;
        }
      })
  }
  return getPage(`https://graph.facebook.com/v2.8/resistance-calendar/events?access_token=${process.env.FB_TOKEN}&limit=100&fields=id,name,description,start_time,attending_count,place,interested_count`);
}

function checkForEvents(events) {
  return ical.fromURLPromise("https://tockify.com/api/feeds/ics/resistance.calendar", {})
    .then(calendar => {
      console.log(`Got ${Object.keys(calendar).length} events from Tockify`)
      const fbids = [];
      const regex = /<https:\/\/(?:.*?\.)?facebook\.com\/events\/(\d+)(?:.*?)>/;
      for (var k in calendar) {
        const result = regex.exec(calendar[k].description);
        if (result && result[1]) {
          fbids.push(result[1]);
        }
      }
      return events.filter(i => !fbids.includes(i.id));
    })
}

function postNewEvent(event) {
  const msg =
    `Looks like this event is new:
    Name: ${event.name}
    Link: https://www.facebook.com/events/${event.id}/
    Location: ${event.place ? event.place.name || "Unknown" : "Unknown"}
    ${event.attending_count} attending, ${event.interested_count} interested
    Description: ${event.description}`;
  console.log(msg);
}

function main() {
  getEvents()
    .then(events => {
      const existingIds = JSON.parse(fs.readFileSync("event_ids.txt"));
      const newEvents = events.filter(i => !existingIds.includes(i.id));
      console.log(`Got ${events.length} events from Facebook, ${newEvents.length} of which are new`)
      existingIds.push(...newEvents.map(i => i.id));
      fs.writeFileSync("event_ids.txt", JSON.stringify(existingIds));
      return checkForEvents(newEvents);
    })
    .then(newEvents => {
      console.log(`Looks like ${newEvents.length} events are new`);
      return Promise.all(newEvents.map(postNewEvent));
    })
}

function init() {
  getEvents()
    .then(events => {
      fs.writeFileSync("event_ids.txt", JSON.stringify(events.map(i => i.id)))
      console.log(`Initialized with ${events.length} events.`);
    })
}

if (process.argv[2] === "init") {
  init();
} else {
  main();
}