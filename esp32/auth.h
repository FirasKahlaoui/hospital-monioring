#ifndef AUTH_H
#define AUTH_H

#include <ESPAsyncWebServer.h>
#include <IPAddress.h>
#include <ctime>
#include <map>
#include <Preferences.h>
#include <LittleFS.h>

std::map<IPAddress, String> userRoles;
std::map<IPAddress, bool> loggedInUsers;
std::map<IPAddress, time_t> loginTimestamps;

extern String currentUsername;
extern String currentPassword;
extern AsyncWebServer server;

bool isSessionValid(IPAddress clientIP) {
  if (loginTimestamps.find(clientIP) != loginTimestamps.end()) {
    time_t currentTime = time(nullptr);
    time_t loginTime = loginTimestamps[clientIP];

    if (difftime(currentTime, loginTime) > 300) { 
      loginTimestamps.erase(clientIP);
      userRoles.erase(clientIP);
      return false;
    }
    return true;
  }
  return false; 
}

bool ensureLoggedIn(AsyncWebServerRequest *request) {
  IPAddress clientIP = request->client()->remoteIP();
  if (!loggedInUsers[clientIP] || !isSessionValid(clientIP)) {
    loggedInUsers[clientIP] = false;
    request->redirect("/login");
    return false;
  }
  return true;
}

bool ensureLoggedInAndAuthorized(AsyncWebServerRequest *request, String requiredRole) {
  IPAddress clientIP = request->client()->remoteIP();
  if (!isSessionValid(clientIP)) {
    request->redirect("/login");
    return false;
  }
  if (userRoles[clientIP] != requiredRole && !requiredRole.isEmpty()) {
    request->redirect("/");
    return false;
  }
  return true;
}

void handleLogin(AsyncWebServerRequest *request) {
  IPAddress clientIP = request->client()->remoteIP();
  if (isSessionValid(clientIP)) {
    request->redirect(userRoles[clientIP] == "admin" ? "/settings" : "/");
    return;
  }

  if (request->method() == HTTP_POST) {
    if (request->hasParam("username", true) && request->hasParam("password", true)) {
      String username = request->getParam("username", true)->value();
      String password = request->getParam("password", true)->value();

      if (username == currentUsername && password == currentPassword) {
        loggedInUsers[clientIP] = true;
        loginTimestamps[clientIP] = time(nullptr);

        String role;
        if (clientIP[0] == 192 && clientIP[1] == 168 && clientIP[2] == 4) {
          role = "admin";
          request->redirect("/settings");
        } else {
          role = "viewer"; 
          request->redirect("/");
        }
        userRoles[clientIP] = role;
        return;
      }
    }
    // Redirect back to login with an error flag
    request->redirect("/login?error=1");
  } else {
    request->send(LittleFS, "/login.html", "text/html");
  }
}

void handleLogout(AsyncWebServerRequest *request) {
  IPAddress clientIP = request->client()->remoteIP();
  loggedInUsers.erase(clientIP);
  userRoles.erase(clientIP);
  request->redirect("/login");
}

void cleanupExpiredSessions() {
  time_t currentTime = time(nullptr);
  for (auto it = loginTimestamps.begin(); it != loginTimestamps.end();) {
    if (difftime(currentTime, it->second) > 300) {
      userRoles.erase(it->first);
      it = loginTimestamps.erase(it);
    } else {
      ++it;
    }
  }
}

void setupAuthRoutes() {
  server.on("/login", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(LittleFS, "/login.html", "text/html");
  });
  server.on("/login", HTTP_POST, handleLogin);
  server.on("/logout", HTTP_GET, handleLogout);
}

#endif
