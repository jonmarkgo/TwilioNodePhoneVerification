var app = require('express')()
  , http = require('http')
  , server = http.createServer(app)
  , io = require('socket.io').listen(server)
  , nStore = require('nstore')
  , client = require('twilio')(process.env.account_sid, process.env.auth_token)
  , speakeasy = require('speakeasy');

var users = nStore.new('data/users.db', function () {
  console.log("Loaded users.db");
});

server.listen(3000);

app.get('/',function(req,res){
  res.render('index.jade')
});

function createUser(phone_number, code, socket) {
  users.save(phone_number, {code: code, verified: false}, function (saverr) {
    if (saverr) { throw saverr; }
    client.sendSms({
        to: phone_number,
        from: process.env.twilio_number,
        body: 'Your verification code is: ' + code
    }, function(twilioerr, responseData) {
      if (twilioerr) { 
        users.remove(phone_number, function(remerr) {if (remerr) { throw remerr; }});
        socket.emit('update', {message: "Invalid phone number!"});
      } else {
        socket.emit('code_generated');
      }
    });
  });
}

function checkVerified(socket, verified, number) {
  if (verified == true) {
    socket.emit('reset');
    socket.emit('update', {message: "You have already verified " + number + "!"});
    return true;
  }
  return false;
}

io.sockets.on('connection', function(socket) {
  console.log('socket.io connected');
  socket.on('register', function(data) {
    var code = speakeasy.totp({key: 'abc123'});
    users.get(data.phone_number, function (geterr, doc, key) {
      if (geterr) {
        createUser(data.phone_number, code, socket);
      }
      else if (checkVerified(socket, doc.verified, data.phone_number) == false) {
        socket.emit('update', {message: "You have already requested a verification code for that number!"});
        socket.emit('code_generated');
      }
    });

  });

  socket.on('verify', function(data) {
    var code = Math.floor((Math.random()*999999)+111111);
    users.get(data.phone_number, function (geterr, doc, key) {
      if (geterr) {
        socket.emit('reset');
        socket.emit('update', {message: "You have not requested a verification code for " + data.phone_number + " yet!"});
      }
      else if (checkVerified(socket, doc.verified, data.phone_number) == false && doc.code == parseInt(data.code)) {
        socket.emit('verified');
        socket.emit('update', {message: "You have successfully verified " + data.phone_number + "!"});
        users.save(data.phone_number, {code: parseInt(data.code), verified: true}, function (saverr) { if (saverr) { throw saverr; }});
      }
      else {
        socket.emit('update', {message: "Invalid verification code!"});
      }
    });

  });
});

