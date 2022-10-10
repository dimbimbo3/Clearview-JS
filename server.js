//////////////////////////
//Initialization - START//
//////////////////////////
//Configuring express server
const express = require('express');
const app = express();

//Body parser config
const bodyparser = require('body-parser');
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: true }));

//Static Middleware
const path = require('path'); 
app.use(express.static(path.join(__dirname, 'views')))

//Set EJS as templating engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

//Session config
const session = require('express-session');
app.use(
    session({
        secret: "secret_string",
        cookie: { maxAge: null }, //auto-delete after closing browser
        saveUninitialized: true,
        resave: false
    })
);

//Port config
const port = 7000;
app.listen(port, () => console.log('Listening on port %s', port));

//Defining MySQL database object
const mysql = require('mysql');
const mysqlConnection = mysql.createConnection({
    host: 'localhost',
    user: 'clearview',
    password: 'clearviewpass',
    database: 'clearviewDatabase',
    multipleStatement: true
});
//Establish connection with database using MySQL object's credentials
mysqlConnection.connect((err) =>{
    if(!err)
        console.log('Connection Established Successfully');
    else
        console.log('Connection Failed!');
});
//////////////////////
//PassportJS - Start//
//////////////////////
//Login authentication config
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
app.use(passport.initialize());
app.use(passport.session());
const flash = require('connect-flash');
app.use(flash());
const bcrypt = require('bcryptjs');

const verifyCallback = (email, password, done) =>{
    //checks if the entered email address is in the database
    mysqlConnection.query('SELECT * FROM employees where email =?', [email], function(err, row){
        if(err){
            return done(err);
        }

        //checks if matching email was even found
        if(row.length == 0){
            return done(null, false, ('error', 'Invalid login.'));
        }

        //checks if the password matches the one associated with email in database
        const isValid = validPassword(password, row[0].password);

        user = {
            empID : row[0].empID,
            deptID : row[0].deptID,
            email : row[0].email
        };

        //if the password matches then serialize the user
        if(isValid){
            return done(null, user);
        }
        else
            return done(null, false, ('error', 'Invalid login.'));
    });
};

passport.use(new LocalStrategy({ usernameField:'email', passwordField:'pass' }, verifyCallback));

passport.serializeUser((user,done) =>{
    done(null, user.empID);
});

passport.deserializeUser((empID,done) =>{
    mysqlConnection.query('SELECT * FROM employees where empID =?', [empID], (err, row) =>{
        if(err){
            return done(err);
        }
        done(null, row[0]);
    });
});

//Checks if the entered password matches the hash
function validPassword(password, hash){
    var hashVerify = bcrypt.compareSync(password,hash);
    return hashVerify;
}

//Determines if an employee has logged in
function isAuth(req,res,next){
    if(req.isAuthenticated())
        next();
    else{
        req.flash('error', 'Please login to access desired page.')
        res.redirect('/login');
    }
}


//Determines the CEO is logged in
function isAdmin(req,res,next){
    if(req.isAuthenticated() && req.user.empID == 1)
        next();
    else{
        req.flash('error', 'You do not have access to that page.');
        res.redirect('/empTable');
    }
}

//Determines if the entered employee email already exists in the database
function emailExists(req,res,next){
    mysqlConnection.query('SELECT * FROM employees where email =?', [req.body.email], (err, row) =>{
        if(err)
            console.log(err);
        else if(row.length > 0){
            req.flash('error', 'Email address already exists in the database.');
            res.redirect('/newEmployee');
        }
        else
            next();
    });
}

//Determines if the entered product already exists in the database
function productExists(req,res,next){
    mysqlConnection.query('SELECT * FROM products where productName =?', [req.body.prodName], (err, row) =>{
        if(err)
            console.log(err);
        else if(row.length > 0){
            req.flash('error', 'Product already exists in the database.');
            res.redirect('/newProduct');
        }
        else
            next();
    });
}
//////////////////////
//PassportJS -  End///
//////////////////////
//////////////////////////
//Initialization - END  //
//////////////////////////
//Default end point
app.get('/', (req, res) =>{
    res.redirect('/welcome');
});

//Router to welcome page
app.get('/welcome', (req, res) =>{
    var userSession = req.session; //variable for accessing session
    userSession.cart = {}; //sets session cart to empty
    userSession.runningTotal = 0; //sets running total to 0

    res.render('pages/welcome');
});
////////////////////
//Customer - START//
////////////////////
//Router to customer about page
app.get('/about', (req, res) =>{
    res.render('pages/customer/about');
});

//Router to customer product list page (sorted by category ID)
app.get('/products/:categoryID', (req, res) =>{
    //Retrieves all categories
    mysqlConnection.query('SELECT * FROM categories', (err,cats) =>{
        if(!err){
            //Retrieves all products associated with category ID
            mysqlConnection.query('SELECT * FROM products WHERE categoryID =?', [req.params.categoryID], (err,prods) =>{
                if(!err){
                    //Retrieves category associated with category ID
                    mysqlConnection.query('SELECT * FROM categories WHERE categoryID =?', [req.params.categoryID], (err,row) =>{
                        if(!err){
                            res.render('pages/customer/productList', { categories : cats, products : prods, selectedCat : row[0] });
                        }
                        else
                            console.log(err);
                    });
                }
                else
                    console.log(err);
            });
        }
        else
            console.log(err);
    });
});

//Router for processing the add to cart form action
app.post('/addToCart', (req, res) =>{
    var userSession = req.session; //variable for accessing session

    //retrieves the item from its submitted form
    var item = {
        productID: req.body.productID,
        productName: req.body.productName, 
        productPrice: req.body.productPrice,
        quantity: 1,
        imageLocation: req.body.imageLocation
    };

    //if the item is already in the cart then increase its quantity
    //otherwise adds the item to the cart
    if(typeof userSession.cart[item.productID] !== 'undefined')
        userSession.cart[item.productID].quantity += 1;
    else
        userSession.cart[item.productID] = item;

    //adds the item's price + tax to the running total
    userSession.runningTotal += (item.productPrice * (1+0.07));

    res.redirect('/cart');
});

//Router for processing the remove from cart form action
app.post('/removeFromCart', (req, res) =>{
    var userSession = req.session; //variable for accessing session

    var ID = req.body.productID; //retrieves the item ID from its submitted form

    //updates the running total to reflect the change in quantity
    userSession.runningTotal -= (userSession.cart[ID].productPrice * (1+0.07));

    //if the item's quantity is greater than 1 then decrease its quantity
    //otherwise remove the item from the cart entirely
    if(userSession.cart[ID].quantity > 1){
        userSession.cart[ID].quantity -= 1;
    }
    else
        delete userSession.cart[ID];

    res.redirect('/cart');
});

//Router to the cart page
app.get('/cart', (req, res) =>{
    var userSession = req.session; //variable for accessing session

    //Debug display
    console.log("Cart:");
    console.log(userSession.cart);
    console.log("Total:");
    console.log(userSession.runningTotal);

    res.render('pages/customer/cart', { cart : userSession.cart, total: userSession.runningTotal });
});

//Router for processing the checkout form action
app.post('/checkout', (req,res) =>{
    res.render('pages/customer/checkout');
});

//Router for processing the place order form action
app.post('/placeOrder', (req, res) =>{
    var userSession = req.session; //variable for accessing session

    //retrieves the checkout details from its submitted form
    var first = req.body.first;
    var last = req.body.last;
    var street = req.body.street;
    var city = req.body.city;
    var state = req.body.state;
    var zip = req.body.zip;
    var card = req.body.card;

    //determine the current data and time
    var today = new Date();
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
    var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
    var dateTime = date+' '+time;

    //stored running total (rounded to 2 decimal places)
    var orderTotal = userSession.runningTotal.toFixed(2);

    //calls function to add the order to the database
    addOrder(dateTime,orderTotal,first,last,street,city,state,zip,card);

    //query to obtain created order's ID
    var query = "SELECT * FROM Orders "+
                "WHERE orderDate = '"+dateTime+
                "' AND orderTotal = '"+orderTotal+"' AND custLName = '"+last+"'";

    //retrieves the order ID from the database
    mysqlConnection.query(query,(err, row) =>{
        if(!err){
            var ID = row[0].orderID;
            var items = {cart: userSession.cart}
            //calls function to add each order item to the database
            addOrderItems(ID, items);
        }
        else
            console.log(err);
    });
    
    res.redirect('/welcome');
});

//Adds the given information into the database as an order
function addOrder(dateTime,orderTotal,first,last,street,city,state,zip,card){
    var query = "INSERT INTO orders"+
                "(orderDate,orderTotal,custFName,custLName,custStreet,custCity,custState,custZip,custCard) "+
                "VALUES"+
                "('"+dateTime+"','"+orderTotal+"','"+first+"','"+last+"','"+street+
                "','"+city+"','"+state+"','"+zip+"','"+card+"')";
    
    //adds the order to the database
    mysqlConnection.query(query,(err, rows) =>{
        if(!err)
            console.log("Order successfully inserted.");
        else
            console.log(err);
    });
}

//Adds the cart's items to the database under the given order ID
function addOrderItems(orderID, items){
    //loops through each item in the cart and adds it to the database
    Object.keys(items.cart).forEach(function(prodID){
        var cost = items.cart[prodID].quantity * items.cart[prodID].productPrice; //calculates the total cost of each item
        var query = "INSERT INTO orderitems"+
                    "(orderID,productID,quantity,cost) "+
                    "VALUES"+
                    "('"+orderID+"','"+prodID+"','"+items.cart[prodID].quantity+"','"+cost.toFixed(2)+"')";

        //adds the order item to the database
        mysqlConnection.query(query,(err, rows) =>{
            if(!err)
                console.log("Order item successfully inserted.");
            else
                console.log(err);
        });
    });
};
////////////////////
//Customer -   END//
////////////////////
////////////////////
//Employee - START//
////////////////////
//Router to login page
app.get('/login', (req,res) =>{
    const errors = req.flash().error || [];
    res.render('pages/employee/login', { errors });
});

//Router for processing login form action
app.post('/login', passport.authenticate('local', {
    successRedirect: '/empTable',
    failureRedirect: '/login',
    failureFlash: true
}));

//Router for processing logout
app.get('/logout', (req,res) =>{
    //deletes the user from session and returns to welcome
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/welcome');
    });
});

//Router to employee table
app.get('/empTable', isAuth, (req,res) =>{
    const errors = req.flash().error || [];
    mysqlConnection.query('SELECT * FROM employees', (err, rows) =>{
        if(!err){
            res.render('pages/employee/empTable', { employees : rows, user, errors });
        }
        else
            console.log(err);
    });
});

//Router for processing fire employee form action
app.post('/fireEmployee', isAdmin, (req, res) =>{
    mysqlConnection.query('DELETE FROM employees WHERE empID =?', [req.body.empID], (err, rows) =>{
        if(!err){
            res.redirect('/empTable');
        }
        else
            console.log(err);
    });
});

//Router to new employee page
app.get('/newEmployee', isAdmin, (req, res) =>{
    const errors = req.flash().error || [];
    res.render('pages/employee/newEmp', { errors });
})

//Router for processing hire employee form action
app.post('/hireEmployee', isAdmin, emailExists, (req, res) =>{
    var first = req.body.first;
	var last = req.body.last;
	var salary = req.body.salary;
    var deptID = req.body.dept;
	var email = req.body.email;
    var password = hashPassword(req.body.pass);

    //inserts new employee into the database and returns to employee table
    query = "INSERT INTO employees(deptID, fName, lName, salary, email, password) "+
            "VALUES('"+deptID+"','"+first+"','"+last+"','"+salary+"','"+email+"','"+password+"')";
    mysqlConnection.query(query, (err, rows) =>{
        if(err)
            console.log(err);
        else
            res.redirect('/empTable');
    });
});

//Hashes the newly entered password
function hashPassword(password){
    var hashedPass = bcrypt.hashSync(password);
    return hashedPass;
}

//Router to product table
app.get('/prodTable', isAuth, (req,res) =>{
    mysqlConnection.query('SELECT * FROM products', (err, rows) =>{
        if(!err){
            res.render('pages/employee/prodTable', { products : rows, user });
        }
        else
            console.log(err);
    });
});

//Router to new product page
app.get('/newProduct', isAdmin, (req, res) =>{
    const errors = req.flash().error || [];
    res.render('pages/employee/newProd', { errors });
})

//Router for processing add product form action
app.post('/addProduct', isAdmin, productExists, (req, res) =>{
    var categoryID = req.body.catID;
    var productName = req.body.prodName;
    var price = req.body.price;
    var imageLocation = "../../images/"+req.body.imageName;

    //inserts new product into the database and returns to product table
    query = "INSERT INTO products(categoryID, productName, price, imageLocation) "+
            "VALUES('"+categoryID+"','"+productName+"','"+price+"','"+imageLocation+"')";
    mysqlConnection.query(query, (err, rows) =>{
        if(err)
            console.log(err);
        else
            res.redirect('/prodTable');
    });
});

//Router to order table
app.get('/orderTable', isAuth, (req,res) =>{
    mysqlConnection.query('SELECT * FROM orders', (err, rows) =>{
        if(!err){
            res.render('pages/employee/orderTable', { orders : rows, user });
        }
        else
            console.log(err);
    });
});

//Router for processing remove order form action
app.post('/removeOrder', isAdmin, (req, res) =>{
    mysqlConnection.query('DELETE FROM orderItems WHERE orderID =?', [req.body.orderID], (err, rows) =>{
        if(!err){
            mysqlConnection.query('DELETE FROM orders WHERE orderID =?', [req.body.orderID], (err, rows) =>{
                if(!err){
                    res.redirect('/orderTable');
                }
                else
                    console.log(err);
            });
        }
        else
            console.log(err);
    })
});

////////////////////
//Employee -   END//
////////////////////