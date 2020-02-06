const { Spotify } = require('../tools/oauth/Provider');
const db = require('../database');
const Axios = require('axios');
const dbTools = require('./dbTools');

const refresh = user => {
  const infos = Spotify.refresh(user.refreshToken);

  return db.storeInUser('_id', user._id, infos);
}

const createHttpClient = access => {
  const axios = Axios.create({
    headers: {
      Authorization: `Bearer ${access}`,
    },
  });

  return axios;
}

const loop = async user => {
  console.log('Refreshing for ', user.username);

  if (Date.now() > user.expiresIn) {
    user = await refresh(user);
    console.log('Refreshed token for ', user.username);
  }

  const client = createHttpClient(user.accessToken);

  let timestamp = user.lastTimestamp;
  const url = 'https://api.spotify.com/v1/me/player/recently-played';

  if (timestamp && timestamp > 0) {
    url += `?after=${user.lastTimestamp}`;
  }

  try {
    const { data } = await client.get(url);

    if (data.items.length > 0) {
      //await db.storeInUser('_id', user._id, {
      //  lastTimestamp: Date.now(),
      //});
      const tracks = data.items.map(e => e.track);
      await dbTools.saveMusics(tracks, user.accessToken);
      const ids = tracks.map(e => e.id);
      await db.addTrackIdsToUser('_id', user._id, ids);
    }
  } catch (e) {
    console.error(e);
  }

};

const reflect = p => p.then(v => ({ failed: false }), e => ({ failed: true, error: e }));
const wait = ms => new Promise((s, f) => setTimeout(s, ms));

const dbLoop = async () => {
  return;
  let nbUsers = await db.getUsersNb();
  const batchSize = 1;
  console.log('Starting loop for ', nbUsers, ' users');

  for (let i = 0; i < nbUsers; i += batchSize) {
    const users = await db.getUsers(
      batchSize,
      i * batchSize,
      {
        activated: true,
      },
    );

    console.log(users);

    const promises = users.map(us => reflect(loop(us)));
    const results = await Promise.all(promises);

    results.filter(e => e.failed).forEach(e => console.log(e.error));

    await wait(30 * 1000);
  }
}

module.exports = {
  dbLoop,
};