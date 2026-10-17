import SwiftUI
import RelayCore
import UIKit

/// An inline placement shared by campus pages, outside student checkout flows.
struct CampusPromotionPlacement: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var sampleDetail: CampusPromotion?
    let placement: String

    private var promotion: CampusPromotion? {
        store.promotions.first {
            $0.sample != true && $0.isVisible(campus: store.campus, placement: placement) && !store.dismissedPromotionIDs.contains($0.id)
        } ?? store.promotions.first {
            $0.isVisible(campus: store.campus, placement: placement) && !store.dismissedPromotionIDs.contains($0.id)
        }
    }

    var body: some View {
        if let promotion {
            VStack(alignment: .leading, spacing: 0) {
                PromotionArtwork(source: promotion.image)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 11) {
                    HStack(alignment: .top, spacing: 6) {
                        Text(promotion.sample == true ? "SPONSORED · SAMPLE" : "SPONSORED")
                            .font(.system(.caption2, weight: .semibold)).tracking(1.2)
                            .foregroundStyle(RelayTheme.secondary)
                        Spacer(minLength: 0)
                        Button { store.dismissedPromotionIDs.insert(promotion.id) } label: {
                            Image(systemName: "xmark").font(.caption).frame(width: 44, height: 44)
                        }.accessibilityLabel("Dismiss campus promotion").padding(.trailing, -12).padding(.vertical, -15)
                    }
                    Button {
                        if promotion.sample == true { sampleDetail = promotion }
                        else if let destination = promotion.destination { openURL(destination) }
                    } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(promotion.title).font(RelayTheme.heading(22)).tracking(-0.6)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(promotion.description).font(.subheadline).foregroundStyle(RelayTheme.secondary)
                                .fixedSize(horizontal: false, vertical: true).lineSpacing(3)
                            HStack { Text(promotion.sample == true ? "Preview campus opportunity" : promotion.cta); Image(systemName: "arrow.up.right") }
                                .font(.caption.weight(.semibold)).padding(.top, 2)
                        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityIdentifier("open-campus-promotion")
                    Text(promotion.sponsor).font(.caption2).foregroundStyle(RelayTheme.secondary)
                }.padding(19)
            }
            .foregroundStyle(RelayTheme.ink)
            .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 21))
            .clipShape(RoundedRectangle(cornerRadius: 21))
            .overlay(RoundedRectangle(cornerRadius: 21).stroke(RelayTheme.line, lineWidth: 1))
            .accessibilityIdentifier("campus-promotion-\(placement)")
            .sheet(item: $sampleDetail) { promotion in
                PromotionSampleDetail(promotion: promotion)
            }
        }
    }
}

private struct PromotionArtwork: View {
    let source: String
    @State private var decodedImage: UIImage?
    var body: some View {
        GeometryReader { geometry in
            Group {
                if let decodedImage { Image(uiImage: decodedImage).resizable().scaledToFill() }
                else if source.hasPrefix("/images/") {
                    Image(URL(fileURLWithPath: source).deletingPathExtension().lastPathComponent).resizable().scaledToFill()
                } else { RelayTheme.lime.overlay { Image(systemName: "leaf").font(.largeTitle).foregroundStyle(RelayTheme.forest) } }
            }.frame(width: geometry.size.width, height: geometry.size.height).clipped()
        }
        .aspectRatio(3, contentMode: .fit)
        .task(id: source) {
            decodedImage = nil
            guard source.hasPrefix("data:image/"), let separator = source.firstIndex(of: ","),
                  let data = Data(base64Encoded: String(source[source.index(after: separator)...])) else { return }
            let image = await Task.detached(priority: .utility) { UIImage(data: data) }.value
            guard !Task.isCancelled else { return }
            decodedImage = image
        }
    }
}

private struct PromotionSampleDetail: View {
    @Environment(\.dismiss) private var dismiss
    let promotion: CampusPromotion
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    PromotionArtwork(source: promotion.image).clipShape(RoundedRectangle(cornerRadius: 18))
                    Eyebrow(text: "SAMPLE CAMPUS PROMOTION")
                    Text(promotion.title).font(RelayTheme.heading(30)).tracking(-1)
                    Text(promotion.description).foregroundStyle(RelayTheme.secondary)
                    Text(promotion.sponsor).font(.caption).foregroundStyle(RelayTheme.secondary)
                    DemoNotice(text: "This is an example ad. There is no live event registration, study enrollment, payment or offer.")
                    if let destination = promotion.destination {
                        Link(destination: destination) { Label("Visit university website", systemImage: "arrow.up.right") }
                            .buttonStyle(RelayPrimaryButton())
                    }
                }.padding(22)
            }.background(RelayTheme.paper).navigationTitle("Campus partner").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
