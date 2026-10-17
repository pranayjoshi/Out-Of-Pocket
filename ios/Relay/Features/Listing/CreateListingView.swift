import SwiftUI
import PhotosUI
import RelayCore

struct CreateListingView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var price = ""
    @State private var details = ""
    @State private var category: RelayCore.Category = .dorm
    @State private var condition = "Good"
    @State private var photoItem: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var photoError: String?
    private var valid: Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.count <= 100 && details.trimmingCharacters(in: .whitespacesAndNewlines).count >= 15 && Money.parse(price) != nil && (category != .free || Money.parse(price) == 0) }
    private var fallbackImage: String {
        switch category { case .tech: "headphones"; case .books: "books"; case .transport: "bike"; case .free: "plant"; default: "chair" }
    }
    var body: some View {
        let currentPhotoData = photoData
        return NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    SectionTitle(eyebrow: "SOMEONE’S NEXT FAVORITE THING", title: "Give it a next chapter.")
                    Text("A few honest details can make someone’s whole semester.").font(.subheadline).foregroundStyle(RelayTheme.secondary)
                    PhotosPicker(selection: $photoItem, matching: .images, photoLibrary: .shared()) {
                        VStack(spacing: 11) {
                            if let currentPhotoData, let image = UIImage(data: currentPhotoData) {
                                Image(uiImage: image).resizable().scaledToFill().frame(height: 170).clipped().clipShape(RoundedRectangle(cornerRadius: 18))
                            } else {
                                Image(systemName: "camera").font(.system(size: 31, weight: .light))
                                Text("Add a photo").font(.subheadline.weight(.semibold))
                                Text("Or try a clearly labeled sample photo.").font(.caption)
                            }
                        }.foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity).frame(minHeight: 160)
                            .padding(12).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 23))
                    }.accessibilityLabel("Choose a listing photo")
                    FormField(label: "What are you passing on?", placeholder: "A chair with a lot of good stories…", text: $title)
                    HStack {
                        Text("Category").font(.subheadline.weight(.medium)); Spacer()
                        Picker("Category", selection: $category) { ForEach(RelayCore.Category.allCases.filter { $0 != .all }) { Text($0.rawValue).tag($0) } }.tint(RelayTheme.forest)
                    }
                    FormField(label: "Price ($) · zero means free", placeholder: "35.00", text: $price).keyboardType(.decimalPad).disabled(category == .free)
                    HStack {
                        Text("Condition").font(.subheadline.weight(.medium)); Spacer()
                        Picker("Condition", selection: $condition) { ForEach(["Like new", "Good", "Well-loved", "Needs repair"], id: \.self) { Text($0) } }.tint(RelayTheme.forest)
                    }
                    VStack(alignment: .leading, spacing: 9) {
                        Text("The honest details").font(.subheadline.weight(.medium))
                        TextField("What works, what’s included, and any little imperfections…", text: $details, axis: .vertical)
                            .lineLimit(4...8).padding(15).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14))
                        Text("At least 15 characters. Leave personal contact details out.").font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                    if let photoError { Text(photoError).font(.caption).foregroundStyle(.red) }
                    DemoNotice(text: photoData == nil ? "Saved only on this device. Without a photo, a sample image is used and labeled." : "Your photo and sample listing stay on this device. They are not uploaded.")
                    Button("Publish sample listing") { publish() }.buttonStyle(RelayPrimaryButton()).disabled(!valid)
                        .accessibilityIdentifier("publish-listing")
                }.foregroundStyle(RelayTheme.ink).padding(22)
            }.background(RelayTheme.paper)
                .navigationTitle("Pass something on").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: category) { _, value in if value == .free { price = "0" } }
                .task(id: photoItem) {
                    guard let photoItem else { return }
                    do {
                        guard let data = try await photoItem.loadTransferable(type: Data.self), data.count < 25_000_000,
                              let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.8) else {
                            photoError = "Please choose an image smaller than 25 MB."; return
                        }
                        photoData = jpeg; photoError = nil
                    } catch { photoError = "That photo couldn’t be loaded. Please try another." }
                }
        }.presentationDragIndicator(.visible)
    }
    private func publish() {
        guard valid, let cents = Money.parse(price) else { return }
        var imageName = fallbackImage
        if let photoData {
            do { imageName = try store.savePhoto(photoData) }
            catch { photoError = "This device couldn’t save the photo. Try again before publishing."; return }
        }
        let listing = Listing(title: title.trimmingCharacters(in: .whitespacesAndNewlines), category: cents == 0 ? .free : category,
                              priceCents: cents, imageName: imageName, condition: condition, campus: store.campus,
                              tag: photoData == nil ? "Sample photo" : nil,
                              description: details.trimmingCharacters(in: .whitespacesAndNewlines), isOwnListing: true)
        store.publish(listing); dismiss()
    }
}
