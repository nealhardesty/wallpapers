import Foundation
import os

private let logger = Logger(subsystem: "com.roadwaffle.wallpapers.mac", category: "app")

/// Unified log (Console.app, `log stream --predicate 'subsystem == "com.roadwaffle.wallpapers.mac"'`)
/// and stderr, which `make mac-run` shows.
func log(_ message: String) {
    logger.notice("\(message, privacy: .public)")
    FileHandle.standardError.write(Data("wallpapers: \(message)\n".utf8))
}
