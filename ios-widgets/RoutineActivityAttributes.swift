import ActivityKit
import Foundation

public struct RoutineActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var activityName: String
        public var emoji: String
        public var isFixed: Bool
        public var startDate: Date
        public var endDate: Date
        public var nextActivityName: String
        public var nextActivityStartDate: Date
        public var isTransitionAlert: Bool

        public init(
            activityName: String,
            emoji: String,
            isFixed: Bool,
            startDate: Date,
            endDate: Date,
            nextActivityName: String,
            nextActivityStartDate: Date,
            isTransitionAlert: Bool
        ) {
            self.activityName = activityName
            self.emoji = emoji
            self.isFixed = isFixed
            self.startDate = startDate
            self.endDate = endDate
            self.nextActivityName = nextActivityName
            self.nextActivityStartDate = nextActivityStartDate
            self.isTransitionAlert = isTransitionAlert
        }
    }

    public var routineId: String

    public init(routineId: String) {
        self.routineId = routineId
    }
}
