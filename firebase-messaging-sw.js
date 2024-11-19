importScripts('https://www.gstatic.com/firebasejs/10.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.4.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDmuTmID03W_985LWLRkHZZVVsKEET_s48",
    authDomain: "eventbrighter-22f02.firebaseapp.com",
    projectId: "eventbrighter-22f02",
    storageBucket: "eventbrighter-22f02.appspot.com",
    messagingSenderId: "852808214445",
    appId: "1:852808214445:web:1f4c59a5ba9a56891ee324"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('Received background message:', payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/gathurUP.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
