#define DISCORDPP_IMPLEMENTATION
#include "discordpp.h"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <mutex>
#include <queue>
#include <string>
#include <thread>

namespace {
constexpr uint64_t kApplicationId = 1568756074692083925ULL;
std::atomic<bool> gRunning{true};
std::mutex gOutputMutex;
std::mutex gCommandMutex;
std::queue<std::string> gCommands;

std::string jsonEscape(const std::string& value) {
  std::string out;
  out.reserve(value.size() + 8);
  for (unsigned char c : value) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default: if (c >= 0x20) out += static_cast<char>(c);
    }
  }
  return out;
}

void emit(const std::string& line) {
  std::lock_guard<std::mutex> lock(gOutputMutex);
  std::cout << line << '\n' << std::flush;
}

std::string statusName(discordpp::StatusType status) {
  switch (status) {
    case discordpp::StatusType::Online: return "Online";
    case discordpp::StatusType::Idle: return "Idle";
    case discordpp::StatusType::Dnd: return "Do Not Disturb";
    case discordpp::StatusType::Streaming: return "Streaming";
    case discordpp::StatusType::Invisible: return "Invisible";
    case discordpp::StatusType::Offline: return "Offline";
    default: return "Unknown";
  }
}

void emitFriends(const std::shared_ptr<discordpp::Client>& client) {
  if (client->GetStatus() != discordpp::Client::Status::Ready) return;
  std::string json = "{\"type\":\"friends\",\"friends\":[";
  bool first = true;
  const discordpp::RelationshipGroupType groups[] = {
    discordpp::RelationshipGroupType::OnlinePlayingGame,
    discordpp::RelationshipGroupType::OnlineElsewhere,
    discordpp::RelationshipGroupType::Offline
  };
  for (const auto group : groups) {
    for (const auto& relationship : client->GetRelationshipsByGroup(group)) {
      if (relationship.DiscordRelationshipType() != discordpp::RelationshipType::Friend) continue;
      auto user = relationship.User();
      if (!user) continue;
      const auto& friendUser = *user;
      const auto activity = friendUser.GameActivity();
      const std::string name = friendUser.DisplayName().empty() ? friendUser.Username() : friendUser.DisplayName();
      const std::string username = friendUser.Username();
      const std::string avatar = friendUser.AvatarUrl(discordpp::UserHandle::AvatarType::Gif,
                                                       discordpp::UserHandle::AvatarType::Png);
      const std::string status = statusName(friendUser.Status());
      std::string activityName, activityDetails, activityState;
      if (activity) {
        activityName = activity->Name();
        if (auto details = activity->Details()) activityDetails = *details;
        if (auto state = activity->State()) activityState = *state;
      }
      if (!first) json += ',';
      first = false;
      json += "{\"id\":\"" + std::to_string(friendUser.Id()) + "\",\"name\":\"" + jsonEscape(name) +
              "\",\"username\":\"" + jsonEscape(username) + "\",\"avatar\":\"" + jsonEscape(avatar) +
              "\",\"status\":\"" + jsonEscape(status) + "\",\"activity\":\"" +
              jsonEscape(activityName) + "\",\"details\":\"" + jsonEscape(activityDetails) +
              "\",\"state\":\"" + jsonEscape(activityState) + "\"}";
    }
  }
  json += "]}";
  emit(json);
}

void applyAccessToken(const std::shared_ptr<discordpp::Client>& client,
                      std::string accessToken,
                      std::string refreshToken,
                      int32_t expiresIn,
                      discordpp::AuthorizationTokenType tokenType = discordpp::AuthorizationTokenType::Bearer) {
  emit("{\"type\":\"token\",\"accessToken\":\"" + jsonEscape(accessToken) +
       "\",\"refreshToken\":\"" + jsonEscape(refreshToken) + "\",\"expiresIn\":" +
       std::to_string(expiresIn) + "}");
  client->UpdateToken(tokenType, std::move(accessToken), [client](discordpp::ClientResult result) {
    if (!result.Successful()) {
      emit("{\"type\":\"error\",\"message\":\"Could not apply Discord Social SDK token: " +
           jsonEscape(result.Error()) + "\"}");
      return;
    }
    client->Connect();
  });
}

void beginAuthorization(const std::shared_ptr<discordpp::Client>& client) {
  auto verifier = client->CreateAuthorizationCodeVerifier();
  discordpp::AuthorizationArgs args{};
  args.SetClientId(kApplicationId);
  args.SetScopes(discordpp::Client::GetDefaultPresenceScopes());
  args.SetCodeChallenge(verifier.Challenge());
  emit("{\"type\":\"status\",\"status\":\"authorizing\"}");
  client->Authorize(args, [client, verifier = std::move(verifier)](discordpp::ClientResult result,
                                                                   std::string code,
                                                                   std::string redirectUri) mutable {
    if (!result.Successful()) {
      emit("{\"type\":\"error\",\"message\":\"Discord authorization failed: " +
           jsonEscape(result.Error()) + "\"}");
      return;
    }
    client->GetToken(kApplicationId, code, verifier.Verifier(), redirectUri,
      [client](discordpp::ClientResult tokenResult, std::string accessToken, std::string refreshToken,
               discordpp::AuthorizationTokenType tokenType, int32_t expiresIn, std::string) {
        if (!tokenResult.Successful()) {
          emit("{\"type\":\"error\",\"message\":\"Discord token exchange failed: " +
               jsonEscape(tokenResult.Error()) + "\"}");
          return;
        }
        applyAccessToken(client, std::move(accessToken), std::move(refreshToken), expiresIn, tokenType);
      });
  });
}

void handleCommand(const std::shared_ptr<discordpp::Client>& client, const std::string& command) {
  if (command == "AUTH") {
    beginAuthorization(client);
  } else if (command.rfind("CONNECT\t", 0) == 0) {
    const std::string access = command.substr(8);
    if (access.empty()) {
      emit("{\"type\":\"error\",\"message\":\"No saved Discord Social SDK token was found.\"}");
      return;
    }
    client->UpdateToken(discordpp::AuthorizationTokenType::Bearer, access, [client](discordpp::ClientResult result) {
      if (!result.Successful()) {
        emit("{\"type\":\"error\",\"message\":\"Saved Social SDK token could not be used. Reconnect Discord to refresh it.\"}");
        return;
      }
      client->Connect();
    });
  } else if (command.rfind("REFRESH\t", 0) == 0) {
    const std::string refresh = command.substr(8);
    client->RefreshToken(kApplicationId, refresh,
      [client](discordpp::ClientResult result, std::string accessToken, std::string refreshToken,
               discordpp::AuthorizationTokenType tokenType, int32_t expiresIn, std::string) {
        if (!result.Successful()) {
          emit("{\"type\":\"error\",\"message\":\"Saved Social SDK session expired. Reconnect Discord to continue.\"}");
          return;
        }
        applyAccessToken(client, std::move(accessToken), std::move(refreshToken), expiresIn, tokenType);
      });
  } else if (command == "REFRESH_FRIENDS") {
    emitFriends(client);
  } else if (command == "QUIT") {
    gRunning.store(false);
  }
}
} // namespace

int main() {
  auto client = std::make_shared<discordpp::Client>();
  client->SetApplicationId(kApplicationId);
  client->AddLogCallback([](std::string message, discordpp::LoggingSeverity severity) {
    if (static_cast<int>(severity) >= static_cast<int>(discordpp::LoggingSeverity::Warning)) {
      std::lock_guard<std::mutex> lock(gOutputMutex);
      std::cerr << "[Discord Social SDK] " << message << '\n';
    }
  }, discordpp::LoggingSeverity::Warning);
  client->SetStatusChangedCallback([client](discordpp::Client::Status status,
                                            discordpp::Client::Error error,
                                            int32_t errorDetail) {
    if (status == discordpp::Client::Status::Ready) {
      emit("{\"type\":\"status\",\"status\":\"ready\"}");
      emitFriends(client);
    } else if (error != discordpp::Client::Error::None) {
      emit("{\"type\":\"error\",\"message\":\"Discord Social SDK connection failed (" +
           std::to_string(static_cast<int>(error)) + ":" + std::to_string(errorDetail) + ").\"}");
    }
  });
  client->SetRelationshipGroupsUpdatedCallback([client](uint64_t) { emitFriends(client); });

  std::thread reader([] {
    std::string line;
    while (std::getline(std::cin, line)) {
      std::lock_guard<std::mutex> lock(gCommandMutex);
      gCommands.push(std::move(line));
    }
    gRunning.store(false);
  });

  while (gRunning.load()) {
    std::queue<std::string> ready;
    {
      std::lock_guard<std::mutex> lock(gCommandMutex);
      std::swap(ready, gCommands);
    }
    while (!ready.empty()) {
      handleCommand(client, ready.front());
      ready.pop();
    }
    discordpp::RunCallbacks();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  if (reader.joinable()) reader.detach();
  return 0;
}
