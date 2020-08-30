const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const _ = require('lodash');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const findOrCreate = require('mongoose-findorcreate');
const stringSimilarity = require('string-similarity');

const app = express();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static('public'));
app.use('/posts', express.static(__dirname + '/posts/css'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js'));
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));
app.use(session({
  secret: 'My name is A.H.M. Abdus Samee',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect('mongodb+srv://Abdus:21@cluster0.r2uaj.mongodb.net/stackDB', {useNewUrlParser : true, useUnifiedTopology: true, useFindAndModify: false });
// mongoose.connect('mongodb://localhost:27017/stackDB', {useNewUrlParser : true, useUnifiedTopology: true, useFindAndModify: false });
mongoose.set('useCreateIndex', true);

const answerSchema = new mongoose.Schema({
  answer: {
    type: String,
    required: true
  },
  author: String,
  title: String
});

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  answers: [answerSchema],
  tags: [String]
});

const userSchema = new mongoose.Schema({
  username: {
    type: String
  },
  password: {
    type: String
  },
  postList: [postSchema],
  answerList: [answerSchema]
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Answer = mongoose.model('Answer', answerSchema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.route('/')
  .get(function(req, res){
    res.sendFile(__dirname + '/main.html');
  });

app.route('/home')
  .get(function(req, res){
    if(req.isAuthenticated()){
      Post.find({}, function(err, postList){
        if(!err){
          res.render('test-home', {postList: postList, logged: true});
        }
      });
    }else{
      Post.find({}, function(err, postList){
        if(!err){
          res.render('test-home', {postList: postList, logged: false});
        }
      });
    }
  });

app.route('/register')
  .get(function(req, res){
    res.sendFile(__dirname + '/register.html');
  })
  .post(function(req, res){
    User.register({username: req.body.username}, req.body.password, function(err, user){
      if(err){
        console.log(err);
        res.redirect('/register');
      }else{
        res.redirect('/');
      }
    });
  });

app.route('/login')
  .get(function(req, res){
    res.sendFile(__dirname + '/login.html');
  })
  .post(function(req, res){
    const user = new User({
      username: req.body.username,
      password: req.body.password
    });

    req.login(user, function(err){
      if(err){
        console.log(err);
        res.redirect('/login');
      }else{
        passport.authenticate("local")(req, res, function(){
          res.redirect('/home');
        })
      }
    });
  });

app.route('/logout')
   .get(function(req, res){
     req.logout();
     res.redirect('/');
   });

app.route('/post')
    .post(function(req, res){
      const title = req.body.title;
      let changedTitle = title.split(" ").join("-");
      res.redirect('/posts/' + changedTitle);
    });

app.route('/posts/:postTitle')
  .get(function(req, res){
    const postTitle = req.params.postTitle;
    let changedTitle = postTitle.split("-").join(" ");

    Post.findOne({title: changedTitle}, function(err, foundPost){
      if(!err){
        if(!foundPost){
          res.redirect('/home');
        }else{
          Post.findOne({title: changedTitle}, function(err, foundAns){
            if(!err){
              if(req.isAuthenticated()) res.render('test-post', {title: foundPost.title, body: foundPost.body, ansList: foundAns.answers, tagList: foundPost.tags, logged: true});
              else res.render('test-post', {title: foundPost.title, body: foundPost.body, ansList: foundAns.answers, tagList: foundPost.tags, logged: false});
            }else{
              console.log(err);
              res.redirect('/home');
            }
          });
        }
      }else{
        console.log(err);
      }
    });
  })
  .post(function(req, res){
    const ansTitle = req.body.answerTitle;
    const ansBody = req.body.answerBody.trim();
    const name = req.user.username;

    const answer = new Answer({
      answer: ansBody,
      author: name,
      title: ansTitle
    });
    answer.save();

    Post.findOne({title: ansTitle}, function(err, foundPost){
      foundPost.answers.push(answer);
      foundPost.save();
    });

    // User.findOne({username: name}, function(err, foundUser){
    //   Post.findOne({title: ansTitle}, function(err, foundPost){
    //     foundUser.postList.push(foundPost);
    //     foundUser.save();
    //   });
    // });

    User.findOne({username: name}, function(err, foundUser){
      foundUser.answerList.push(answer);
      foundUser.save();
    });

    let changedTitle = ansTitle.split(" ").join("-");
    res.redirect('/posts/' + changedTitle);
  });

app.route('/ask')
  .get(function(req, res){
    if(req.isAuthenticated()) res.render('compose');
    else res.redirect('/login');
  })
  .post(function(req, res){
    const title = req.body.postTitle;
    const body = req.body.postBody;
    const name = req.user.username;
    let tagList = req.body.postTags;
    let tagArr = tagList.split(' ');

    const post = new Post({
      title: title,
      body: body,
      tags: tagArr
    });
    post.save();

    User.findOne({username: name}, function(err, foundUser){
      foundUser.postList.push(post);
      foundUser.save();
    });

    res.redirect('/home');
  });

app.route('/search')
  .post(function(req, res){
    let findQuestion = req.body.findQuestion;
    let arr = [];
    let postArr = [];

    if(findQuestion.split(' ').length == 1){
      findQuestion = findQuestion.toLowerCase();
      Post.find({}, function(err, postList){
        if(!err){
          postList.forEach(function(post){
            postArr = post.title.split(' ');
            postArr = postArr.filter(function(word){
              word = word.toLowerCase();
              return word.indexOf(findQuestion) !== -1;
            });
            if(postArr.length) arr.push(post);
          });
          if(req.isAuthenticated()) res.render('search-post', {searchPosts: arr, logged: true});
          else res.render('search-post', {searchPosts: arr, logged: false});
        }else{
          console.log(err);
        }
      });
    }else{
      Post.find({}, function(err, postList){
        if(!err){
          postList.forEach(function(post){
            let comp = stringSimilarity.compareTwoStrings(findQuestion, post.title);
            if(comp >= 0.1) arr.push(post);
          });
          if(req.isAuthenticated()) res.render('search-post', {searchPosts: arr, logged: true});
          else res.render('search-post', {searchPosts: arr, logged: false});
        }else{
          console.log(err);
        }
      });
    }
  });

app.route('/profile')
  .get(function(req, res){
    const user = req.user;
    res.render('profile', {name: user.username, postList: user.postList, answerList: user.answerList})
  });

app.listen(process.env.PORT || 3000, function(){
  console.log('Server started on port 3000 ...');
});
