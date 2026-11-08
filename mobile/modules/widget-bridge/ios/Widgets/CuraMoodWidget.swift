import SwiftUI
import WidgetKit

// MARK: - Mood Widget Timeline Provider

public struct CuraMoodTimelineEntry: TimelineEntry {
  public let date: Date
  public let snapshot: WidgetSnapshotModel?
}

public struct CuraMoodProvider: TimelineProvider {
  public func placeholder(in context: Context) -> CuraMoodTimelineEntry {
    CuraMoodTimelineEntry(date: Date(), snapshot: nil)
  }

  public func getSnapshot(in context: Context, completion: @escaping (CuraMoodTimelineEntry) -> Void) {
    let snapshot = WidgetDataLoader.loadCurrentSnapshot()
    completion(CuraMoodTimelineEntry(date: Date(), snapshot: snapshot))
  }

  public func getTimeline(in context: Context, completion: @escaping (Timeline<CuraMoodTimelineEntry>) -> Void) {
    let snapshot = WidgetDataLoader.loadCurrentSnapshot()
    let entry = CuraMoodTimelineEntry(date: Date(), snapshot: snapshot)
    // Reloads driven by WidgetCenter.shared.reloadAllTimelines()
    let timeline = Timeline(entries: [entry], policy: .never)
    completion(timeline)
  }
}

// MARK: - Mood Widget SwiftUI View

public struct CuraMoodWidgetView: View {
  public let entry: CuraMoodTimelineEntry

  public init(entry: CuraMoodTimelineEntry) {
    self.entry = entry
  }

  private var snapshot: WidgetSnapshotModel? {
    entry.snapshot
  }

  private let moodOptions: [(name: String, label: String)] = [
    ("happy", "Happy"),
    ("calm", "Calm"),
    ("sad", "Sad"),
    ("stressed", "Stressed"),
    ("tired", "Tired")
  ]

  public var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // Header
      HStack {
        Text("Mood Check-in")
          .font(.system(size: 14, weight: .bold))
          .foregroundColor(.white)

        Spacer()

        if let snapshot = snapshot, let mood = snapshot.mood.latestMoodType, !mood.isEmpty {
          Text("Latest: \(mood.capitalized)")
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(Color(hex: "A5B4FC"))
        }
      }

      Divider().background(Color(hex: "27273A"))

      if let snapshot = snapshot {
        // Quote Section
        if let quote = snapshot.quote {
          VStack(alignment: .leading, spacing: 2) {
            Text("\"\(quote.text)\"")
              .font(.system(size: 11))
              .foregroundColor(Color(hex: "E4E4E7"))
              .lineLimit(2)
            Text("— \(quote.author)")
              .font(.system(size: 9, weight: .medium))
              .foregroundColor(Color(hex: "8588A3"))
          }
        } else {
          Text("How are you feeling?")
            .font(.system(size: 12))
            .foregroundColor(Color(hex: "8588A3"))
        }

        Spacer()

        // 5 Mood Quick-Log Buttons
        HStack(spacing: 4) {
          ForEach(moodOptions, id: \.name) { opt in
            moodButton(name: opt.name, label: opt.label, userId: snapshot.userId)
          }
        }
      } else {
        Spacer()
        HStack {
          Spacer()
          Text("Open Cura to refresh")
            .font(.system(size: 13))
            .foregroundColor(Color(hex: "8588A3"))
          Spacer()
        }
        Spacer()
      }
    }
    .padding(12)
    .background(Color(hex: "12131A"))
    .widgetURL(URL(string: "cura://mood"))
  }

  @ViewBuilder
  private func moodButton(name: String, label: String, userId: String) -> some View {
    let deepLinkUrl = WidgetActionUrlBuilder.makeMoodLogUrl(moodType: name, userId: userId)

    Link(destination: deepLinkUrl) {
      Text(label)
        .font(.system(size: 10, weight: .semibold))
        .foregroundColor(Color(hex: "E4E4E7"))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Color(hex: "1E1E2A"))
        .cornerRadius(6)
    }
  }
}

// MARK: - Widget Declaration

public struct CuraMoodWidget: Widget {
  public let kind: String = "CuraMoodWidget"

  public init() {}

  public var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CuraMoodProvider()) { entry in
      CuraMoodWidgetView(entry: entry)
    }
    .configurationDisplayName("Cura Mood")
    .description("Check in on your mood and view mindful reflections.")
    .supportedFamilies([.systemMedium])
  }
}
