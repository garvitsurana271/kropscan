
declare global {
    interface Window {
        Razorpay: any;
    }
}

class PaymentService {
    private scriptLoaded = false;

    private loadScript(src: string): Promise<boolean> {
        return new Promise((resolve) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve(true);
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.onload = () => {
                this.scriptLoaded = true;
                resolve(true);
            };
            script.onerror = () => {
                this.scriptLoaded = false;
                resolve(false);
            };
            document.body.appendChild(script);
        });
    }

    async initializePayment(
        amount: number,
        itemTitle: string,
        user: { name: string; email?: string; mobile?: string },
        handlers: { onSuccess: (id: string) => void; onDismiss?: () => void }
    ) {
        const res = await this.loadScript("https://checkout.razorpay.com/v1/checkout.js");

        if (!res) {
            alert("Razorpay SDK failed to load. Are you online?");
            return;
        }

        // Amount in Razorpay is typically in paise (multiply by 100), but check provider. 
        // Razorpay standard is subunits (paise).
        const options = {
            key: import.meta.env.VITE_RAZORPAY_KEY_ID || import.meta.env.VITE_RAZORPAY_TEST_KEY || "rzp_test_HEADER_KEY_PLACEHOLDER", // PROMPT USER TO REPLACE
            amount: amount * 100,
            currency: "INR",
            name: "KropScan",
            description: `Payment for ${itemTitle}`,
            image: "https://kropscan.com/logo.png", // Replace with local or hosted logo
            handler: function (response: any) {
                handlers.onSuccess(response.razorpay_payment_id);
            },
            prefill: {
                name: user.name,
                email: user.email || "farmer@kropscan.com",
                contact: user.mobile || "9999999999",
            },
            notes: {
                address: "KropScan Corporate Office",
            },
            theme: {
                color: "#16a34a", // Green-600
            },
            modal: {
                ondismiss: function () {
                    if (handlers.onDismiss) handlers.onDismiss();
                }
            }
        };

        const paymentObject = new window.Razorpay(options);
        paymentObject.open();
    }
}

export const paymentService = new PaymentService();
