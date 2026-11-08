import SwiftUI
import WidgetKit

@main
public struct CuraWidgetBundle: WidgetBundle {
  public init() {}

  public var body: some Widget {
    CuraTasksWidget()
    CuraMoodWidget()
  }
}
