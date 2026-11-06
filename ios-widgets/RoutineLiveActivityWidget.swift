import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.1, *)
struct RoutineLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RoutineActivityAttributes.self) { context in
            // Lock Screen / Notification Center Banner UI
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(context.state.emoji)
                        .font(.title2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.activityName)
                            .font(.headline)
                            .foregroundColor(.primary)
                        Text(context.state.isFixed ? "🔒 ล็อกเวลา" : "⚡ จัดเวลาอัตโนมัติ")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    if context.state.isTransitionAlert {
                        Text("หมดเวลา! เปิดแอพกดรับทราบ")
                            .font(.caption.bold())
                            .foregroundColor(.red)
                    } else {
                        Text(
                            timerInterval: context.state.startDate...context.state.endDate,
                            countsDown: true
                        )
                        .font(.system(.title2, design: .monospaced).bold())
                        .multilineTextAlignment(.trailing)
                    }
                }

                ProgressView(
                    timerInterval: context.state.startDate...context.state.endDate,
                    countsDown: false
                )
                .tint(context.state.isTransitionAlert ? .red : .blue)

                HStack {
                    Text("ถัดไป: \(context.state.nextActivityName)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                }
            }
            .padding(16)
            .activityBackgroundTint(Color(UIColor.secondarySystemBackground))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Text(context.state.emoji)
                            .font(.title3)
                        Text(context.state.activityName)
                            .font(.subheadline.bold())
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(
                        timerInterval: context.state.startDate...context.state.endDate,
                        countsDown: true
                    )
                    .font(.system(.headline, design: .monospaced).bold())
                    .foregroundColor(context.state.isTransitionAlert ? .red : .accentColor)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text("ถัดไป: \(context.state.nextActivityName)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Spacer()
                        if context.state.isTransitionAlert {
                            Text("กดเข้าแอพเพื่อรับทราบ")
                                .font(.caption.bold())
                                .foregroundColor(.red)
                        }
                    }
                }
            } compactLeading: {
                Text(context.state.emoji)
            } compactTrailing: {
                Text(
                    timerInterval: context.state.startDate...context.state.endDate,
                    countsDown: true
                )
                .font(.system(.caption2, design: .monospaced).bold())
                .frame(width: 48)
            } minimal: {
                Text(context.state.emoji)
            }
        }
    }
}
