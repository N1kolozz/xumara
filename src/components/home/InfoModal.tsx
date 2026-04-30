import { Info } from "lucide-react";

export const InfoModal = () => {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-primary">1.</span> წესები
        </h3>
        <p className="text-sm text-text-soft leading-relaxed">
          ხუმარა არის მხიარული თამაში მეგობრებისთვის. თითოეულ რაუნდში ერთი მოთამაშე ხდება მსაჯი და ირჩევს შავ ბარათს (შეკითხვას/წინადადებას), ხოლო სხვები ირჩევენ საუკეთესო, ყველაზე სასაცილო პასუხს თავისი თეთრი ბარათებიდან.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-primary">2.</span> ოთახები
        </h3>
        <p className="text-sm text-text-soft leading-relaxed">
          თამაშის დასაწყებად ერთმა მოთამაშემ უნდა <strong className="text-foreground">შექმნას ოთახი</strong> და გაუზიაროს PIN კოდი სხვებს. დანარჩენები იყენებენ ამ PIN კოდს <strong className="text-foreground">ოთახში შესაერთებლად</strong>.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-primary">3.</span> როგორ ვითამაშოთ
        </h3>
        <ul className="text-sm text-text-soft leading-relaxed list-disc pl-5 space-y-1 marker:text-primary">
          <li>წაიკითხეთ შავი ბარათი.</li>
          <li>აირჩიეთ ყველაზე შესაფერისი (ან სასაცილო) თეთრი ბარათი თქვენი ხელიდან და გააგზავნეთ.</li>
          <li>მსაჯი წაიკითხავს ყველა პასუხს და გამოავლენს გამარჯვებულს!</li>
        </ul>
      </div>
    </div>
  );
};
