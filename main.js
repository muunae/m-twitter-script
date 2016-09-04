var twitter = require('twitter');
var promise = require('bluebird');
var fs = require('fs');

// Client for twitter
var client = promise.promisifyAll(new twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_SECRET
}));
// Source user id
var user_id = process.env.USER_ID || '767430650202845186';

// Target user screen name
var user_screen_name = process.env.SCREEN_NAME || 'tobyfox';

// Tweet message
var message = process.env.MESSAGE || ", I've followed you! Please follow me back!";

// Log bugs
process.on('unhandledRejection', console.log);

/*
**  Variables
*/

// Has data.json information, which has user/followers/status
var data;

// Number pointing on to which user to follow
var followersCursor;

var checkedAll = false;
var followedAll = false;
/* 
**  Functions and program
*/

// Start the program
async function startProgram(){
  console.log("Starting program.");
  if (message.length > 124){
    console.log("Message bigger than 124 characters!");
    console.log("Aborting.");
    return false;
  }
  console.log("Looking for data.json");
  try {
    let stats = fs.statSync('data.json');
    if (stats.isFile()) {
      console.log("Found data.json");
      // Getting data information
      data = JSON.parse(fs.readFileSync('data.json'));
    }
  } catch (e) {
    console.log("Didn't find data.json; preparing file");
    await findData();
  }
  await run();
}

async function run(){
  if (!followedAll) await followUsers();
  if (!checkedAll && data.status.followed > 999) await unfollowUsers();
  console.log("Waiting 72 minutes for next completion");
  setTimeout(async function(){
    await run();
  }, 4320000);
}

// Look / find followed users and tweet to them
async function followUsers(){
  try {
    console.log("Following users!");
    // First follow user
    let usersFollowed = new Array();
    let t = data.status.followed+10;
    // Checks if hit the max
    if (t > data.followers.length){
      t = data.followers.length;
    }
    if (t == data.status.followed) {
      followedAll = true;
      return false;
    }
    // Looks for every user until hits limit (100)
    // If user is already followed on data.json it will add one to limit
    // to make sure it will follow 100 users / day
    for (let i = data.status.followed; i<t; i++){
      if (data.followers[i].followed) continue;
      console.log("Checking status of " + data.followers[i].name);
      let options = {
        source_id : user_id,
        target_id : data.followers[i].id
      }
      let response = await client.getAsync('friendships/show', options);
      console.log(response);
      data.followers[i].checked = true;
      if (response.relationship.source.following){
        console.log("Already following " + data.followers[i].name);
        data.followers[i].followed = true;
        data.status.followed++;
        continue;
      }
      options = {
        'follow' : true,
        'user_id' : data.followers[i].id
      }
      await client.postAsync('friendships/create', options);
      console.log("Followed user " + data.followers[i].name);
      data.followers[i].followed = true;
      usersFollowed.push(data.followers[i]);
    }
    data.status.followed += usersFollowed.length;
    // Then tweet sending message
    console.log("Tweeting to users followed!");
    for (let i = 0; i<usersFollowed.length; i++){
      let tweetMessage = "@" + usersFollowed[i].screen_name + message;
      let options = {
        status : message
      }
      let response = await client.postAsync('statuses/update', options);
      console.log("Tweeted to " + usersFollowed[i].name );
    }
    fs.writeFileSync('data.json', JSON.stringify(data));
  } catch (err){
    // Something went wrong
    console.log("An error was found.");
    console.log(err);
    fs.writeFileSync('data.json', JSON.stringify(data));
    return false;
  }
}

async function unfollowUsers(){
  try {
    console.log("Following users!");
    let usersFollowed = new Array();
    let t = data.status.checked+10;
    // Checks if hit the max
    if (t > data.followers.length){
      t = data.followers.length;
    }
    if (t == data.status.checked) {
      checkedAll = true;
      return false;
    }
    // First check relationship
    // If user followed has not followed us back, we unfollow them.
    for (let i = data.status.checked; i<t; i++){
      let options = {
        source_id : user_id,
        target_id : data.followers[i].id
      }
      let response = await client.getAsync('friendships/show', options);
      data.followers[i].checked = true;
      if (! response.relationship.target.following){
        // The user is not following us :(
        options = {
          'follow' : true,
          'user_id' : data.followers[i].id
        }
        await client.postAsync('friendships/destroy', options);
        console.log("Unfollowed user " + data.followers[i].name);
      } else {
        console.log("The user " + data.followers[i].name + " has followed us back!");
        data.status.followedUsBack++;
      }
    }
    fs.writeFileSync('data.json', JSON.stringify(data));
  } catch (err) {
    // Something went wrong
    console.log("An error was found.");
    console.log(err);
    fs.writeFileSync('data.json', JSON.stringify(data));
    return false;
  }
}

// Will look for data if data.json is empty
async function findData(){
  try {
    // First look for the user from the user_id
    console.log("Finding user.");
    let options = {
      'screen_name' : user_screen_name
    };
    let user = await client.getAsync('users/show', options);
    let userImportantData = {
      'name' : user.name,
      'screen_name' : user.screen_name,
      'id' : user.id_str
    }
    // Then find followers
    console.log("Finding followers");
    let cursor;
    let i = 1; //Iterator for while loop
    let followers = new Array();
    options = {
      'screen_name' : user_screen_name,
      'count' : 200
    };
    console.log("Cursor: -1 (first page)");
    let response = await client.getAsync('followers/list', options);
    cursor = response.next_cursor;
    followers.push(response.users);
    while (i < 10){
      console.log("Cursor: " + cursor);
      options.cursor = cursor;
      response = await client.getAsync('followers/list', options);
      cursor = response.next_cursor;
      followers.push(response.users);
      i++;
    }
    i = 0;
    console.log("Writing important followers data");
    let followersData = new Array();
    while (i < 10){
      for (let t=0; t<followers[i].length; t++){
        let fData = {
          'name' : followers[i][t].name,
          'screen_name' : followers[i][t].screen_name,
          'id' : followers[i][t].id_str,
          'followed' : false,
          'checked' : false
        }
        followersData.push(fData);
      }
      i++;
    }
    followersData.sort(function(a, b) {
      if(a.screen_name < b.screen_name) return -1;
      if(a.screen_name > b.screen_name) return 1;
      return 0;
    });
    console.log("Setting status and writing to file.");
    let status = {
      followed: 0,
      checked: 0,
      followedUsBack: 0,
      state: 'waiting'
    };
    data = {
      'user': userImportantData,
      'followers': followersData,
      'status': status
    };
    fs.writeFileSync('data.json', JSON.stringify(data));
    console.log("Finished!");
  } catch (err) {
    // Something went wrong
    console.log("An error was found.");
    console.log(err);
    return false;
  }
}

startProgram();